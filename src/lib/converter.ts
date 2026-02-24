export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'any' | string;

export interface Field {
  name: string;
  type: FieldType;
  optional: boolean;
  isArray: boolean;
}

export interface Schema {
  name: string;
  fields: Field[];
}

// Very basic regex-based parsers
export function parseSource(source: string, format: string): Schema[] {
  const schemas: Schema[] = [];

  // Try JSON first (handles both JSON Schema and raw JSON examples)
  try {
    // Clean up trailing commas which break JSON.parse
    const cleanSource = source.replace(/,\s*([\]}])/g, '$1');
    const json = JSON.parse(cleanSource);
    
    // Is it JSON Schema?
    if (json.properties || (json.type === 'object' && json.properties)) {
      let name = json.title || 'MySchema';
      parseJsonSchemaObject(name, json, schemas);
      return schemas;
    }
    
    // It's a raw JSON object example
    if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
      parseRawJsonObject('MySchema', json, schemas);
      return schemas;
    }
  } catch (e) {
    // Ignore JSON parse errors and fallback to regex
  }

  // A very naive line-by-line parser for non-JSON
  const lines = source.split('\n');
  
  let currentName = 'MySchema';
  let currentFields: Field[] = [];
  let hasSeenSchemaDef = false;
  
  for (let line of lines) {
    line = line.trim();
    // Skip empty lines, comments, and block markers
    if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('--') || line === '{' || line === '}') {
      continue;
    }

    // Check if this line starts a new schema
    const nameMatch = line.match(/^(?:export\s+|public\s+|create\s+)?(?:class|interface|type|struct|model|table|message|enum)\s+([a-zA-Z0-9_]+)/i);
    if (nameMatch) {
      if (hasSeenSchemaDef || currentFields.length > 0) {
        schemas.push({ name: currentName, fields: currentFields });
      }
      currentName = nameMatch[1];
      currentFields = [];
      hasSeenSchemaDef = true;
      continue;
    }

    // Skip decorators like @dataclass
    if (line.startsWith('@')) continue;

    // Clean up trailing commas, semicolons, etc.
    line = line.replace(/[,;]$/, '').trim();

    // 1. Try to parse TS/GraphQL/Prisma style: name: type
    let match = line.match(/^([a-zA-Z0-9_]+)\s*\??\s*:\s*([a-zA-Z0-9_\[\]<>\.\?]+)/);
    if (match) {
      const fieldName = match[1];
      const typeStr = match[2];
      const optional = line.includes('?') || typeStr.toLowerCase().includes('optional') || typeStr.toLowerCase().includes('null');
      const isArray = typeStr.includes('[]') || typeStr.includes('Array<') || typeStr.startsWith('[');
      currentFields.push({ name: fieldName, type: normalizeType(typeStr), optional, isArray });
      continue;
    }

    // 2. Try to parse Go/Rust/C#/Java/Pydantic/Dataclass style: Type name OR name: Type (Python)
    // Python style: name: Type
    match = line.match(/^([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_\[\]<>]+)/);
    if (match) {
        const fieldName = match[1];
        const typeStr = match[2];
        const optional = typeStr.includes('Option') || typeStr.includes('?') || typeStr.includes('Optional') || typeStr.includes('None');
        const isArray = typeStr.includes('[]') || typeStr.includes('List[') || typeStr.includes('Sequence[');
        currentFields.push({ name: fieldName, type: normalizeType(typeStr), optional, isArray });
        continue;
    }

    // C-family style: Type name
    match = line.match(/^(?:public\s+|private\s+|protected\s+|let\s+|const\s+|var\s+|val\s+)?([a-zA-Z0-9_\[\]<>\?]+)\s+([a-zA-Z0-9_]+)/);
    if (match && !['export', 'import', 'return', 'if', 'else', 'for', 'while', 'class', 'interface', 'struct', 'type', 'model'].includes(match[1])) {
      const typeStr = match[1];
      const fieldName = match[2];
      const optional = typeStr.includes('Option') || typeStr.includes('?') || typeStr.includes('Optional');
      const isArray = typeStr.includes('[]') || typeStr.includes('List<') || typeStr.includes('Vec<');
      currentFields.push({ name: fieldName, type: normalizeType(typeStr), optional, isArray });
      continue;
    }

    // 3. Try SQL style: name TYPE
    match = line.match(/^([a-zA-Z0-9_]+)\s+([A-Z]+(?:\([0-9]+\))?)/i);
    if (match && !['CREATE', 'TABLE', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'INDEX', 'CONSTRAINT'].includes(match[1].toUpperCase())) {
      const fieldName = match[1];
      const typeStr = match[2];
      const optional = !line.toUpperCase().includes('NOT NULL');
      const isArray = line.toUpperCase().includes('ARRAY') || typeStr.toUpperCase() === 'JSON';
      currentFields.push({ name: fieldName, type: normalizeType(typeStr), optional, isArray });
      continue;
    }
    
    // 4. Try Protobuf style: [repeated] type name = N;
    match = line.match(/^(?:(repeated|optional|required)\s+)?([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)\s*=\s*[0-9]+/);
    if (match) {
        const modifier = match[1];
        const typeStr = match[2];
        const fieldName = match[3];
        const optional = modifier === 'optional';
        const isArray = modifier === 'repeated';
        currentFields.push({ name: fieldName, type: normalizeType(typeStr), optional, isArray });
        continue;
    }
  }

  if (hasSeenSchemaDef || currentFields.length > 0) {
    schemas.push({ name: currentName, fields: currentFields });
  }

  // Fallback if no fields found, maybe it's a simple list of words
  if (schemas.length === 0 || schemas.every(s => s.fields.length === 0)) {
      schemas.length = 0; // Clear empty schemas
      let mainFields: Field[] = [];
      
      // Try to find anything that looks like a key-value pair first
      const kvMatches = source.matchAll(/([a-zA-Z0-9_]+)\s*[:=]\s*([a-zA-Z0-9_\[\]<>]+)/g);
      for (const match of kvMatches) {
          const fieldName = match[1];
          const typeStr = match[2];
          if (!['const', 'let', 'var', 'val', 'def', 'class', 'interface', 'type', 'import', 'export'].includes(fieldName)) {
              mainFields.push({ 
                  name: fieldName, 
                  type: normalizeType(typeStr), 
                  optional: false, 
                  isArray: typeStr.includes('[') || typeStr.includes('Array') || typeStr.includes('List') 
              });
          }
      }

      // If still no fields, extract anything that looks like a word
      if (mainFields.length === 0) {
          const words = source.split(/[\s,;:\(\)\[\]\{\}]+/).filter(w => w.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/));
          
          // Filter out common keywords
          const keywords = new Set(['class', 'interface', 'type', 'struct', 'model', 'table', 'export', 'public', 'private', 'protected', 'const', 'let', 'var', 'val', 'def', 'function', 'return', 'import', 'from', 'default', 'new', 'this', 'super', 'extends', 'implements']);
          
          const validWords = words.filter(w => !keywords.has(w) && w.length > 1);
          
          if (validWords.length > 0) {
              let name = 'MySchema';
              // Use the first word as name if it's capitalized, otherwise use default
              if (validWords[0].match(/^[A-Z]/)) {
                  name = validWords[0];
                  validWords.shift();
              }
              
              // Assume remaining words are fields
              for (const w of validWords) {
                  // Avoid duplicates
                  if (!mainFields.find(f => f.name === w)) {
                      mainFields.push({ name: w, type: 'string', optional: false, isArray: false });
                  }
              }
              schemas.push({ name, fields: mainFields });
          }
      } else {
          schemas.push({ name: 'MySchema', fields: mainFields });
      }
  }

  // Absolute last resort fallback: just create a dummy field so it doesn't crash
  if (schemas.length === 0) {
      schemas.push({ name: 'MySchema', fields: [{ name: 'data', type: 'any', optional: true, isArray: false }] });
  }

  // Post-process to infer relationships from names
  for (const schema of schemas) {
    for (const field of schema.fields) {
      const lowerType = field.type.toLowerCase();
      if (lowerType === 'string' || lowerType === 'any' || lowerType === 'json') {
        const fieldNameLower = field.name.toLowerCase();
        
        // Find a schema that matches the field name
        const matchingSchema = schemas.find(s => {
          const sName = s.name.toLowerCase();
          return sName === fieldNameLower || 
                 sName === fieldNameLower + 'item' || 
                 sName + 's' === fieldNameLower ||
                 sName + 'list' === fieldNameLower ||
                 fieldNameLower === sName + 's' ||
                 fieldNameLower === sName + 'list';
        });
        
        if (matchingSchema) {
          field.type = matchingSchema.name;
        }
      }
    }
  }

  return schemas;
}

function parseRawJsonObject(name: string, obj: any, schemas: Schema[]) {
  const fields: Field[] = [];
  
  for (const [key, val] of Object.entries(obj)) {
    let type: FieldType = 'any';
    let isArray = false;
    
    if (val === null) {
      type = 'any';
    } else if (Array.isArray(val)) {
      isArray = true;
      if (val.length > 0) {
        const firstItem = val[0];
        if (typeof firstItem === 'object' && firstItem !== null) {
          const subName = capitalize(key) + 'Item';
          type = subName;
          parseRawJsonObject(subName, firstItem, schemas);
        } else {
          type = typeof firstItem;
        }
      } else {
        type = 'any';
      }
    } else if (typeof val === 'object') {
      const subName = capitalize(key);
      type = subName;
      parseRawJsonObject(subName, val, schemas);
    } else {
      type = typeof val;
    }
    
    fields.push({
      name: key,
      type: normalizeType(type),
      optional: false, // In raw JSON examples, we assume all present fields are required
      isArray
    });
  }
  
  schemas.push({ name, fields });
}

function parseJsonSchemaObject(name: string, json: any, schemas: Schema[]) {
  const fields: Field[] = [];
  const required = json.required || [];
  
  if (json.properties) {
    for (const [key, val] of Object.entries<any>(json.properties)) {
      let typeStr = val.type || 'any';
      let isArray = typeStr === 'array';
      let actualType = typeStr;
      
      if (isArray && val.items) {
        if (val.items.type === 'object' && val.items.properties) {
          const subName = capitalize(key) + 'Item';
          actualType = subName;
          parseJsonSchemaObject(subName, val.items, schemas);
        } else {
          actualType = val.items.type || 'any';
        }
      } else if (typeStr === 'object' && val.properties) {
        const subName = capitalize(key);
        actualType = subName;
        parseJsonSchemaObject(subName, val, schemas);
      }
      
      const optional = !required.includes(key);
      fields.push({ name: key, type: normalizeType(actualType), optional, isArray });
    }
  }
  
  schemas.push({ name, fields });
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeType(raw: string): FieldType {
  const lower = raw.toLowerCase();
  if (lower.includes('string') || lower.includes('text') || lower.includes('varchar') || lower.includes('char')) return 'string';
  if (lower.includes('int') || lower.includes('float') || lower.includes('double') || lower.includes('number') || lower.includes('decimal') || lower.includes('numeric')) return 'number';
  if (lower.includes('bool') || lower.includes('boolean')) return 'boolean';
  if (lower.includes('date') || lower.includes('time') || lower.includes('timestamp')) return 'date';
  if (lower.includes('any') || lower.includes('unknown') || lower.includes('object') || lower.includes('json')) return 'any';
  
  // Clean up array markers
  let clean = raw.replace(/\[\]/g, '')
                 .replace(/Array</g, '')
                 .replace(/List</g, '')
                 .replace(/Vec</g, '')
                 .replace(/List\[/g, '')
                 .replace(/Sequence\[/g, '')
                 .replace(/>/g, '')
                 .replace(/\]/g, '');
  return clean;
}

export function generateCode(schemas: Schema[], format: string): string {
  // Reverse schemas so dependencies (nested objects) are generated first
  const reversed = [...schemas].reverse();
  return reversed.map(s => generateSingleSchema(s, format)).join('\n\n');
}

function generateSingleSchema(schema: Schema, format: string): string {
  switch (format) {
    case 'ts-interface': return genTsInterface(schema);
    case 'ts-type': return genTsType(schema);
    case 'zod': return genZod(schema);
    case 'pydantic': return genPydantic(schema);
    case 'dataclass': return genDataclass(schema);
    case 'sql-postgres': return genSql(schema, 'postgres');
    case 'sql-mysql': return genSql(schema, 'mysql');
    case 'json-schema': return genJsonSchema(schema);
    case 'graphql': return genGraphql(schema);
    case 'protobuf': return genProtobuf(schema);
    case 'rust': return genRust(schema);
    case 'go': return genGo(schema);
    case 'java': return genJava(schema);
    case 'csharp': return genCsharp(schema);
    case 'swift': return genSwift(schema);
    case 'kotlin': return genKotlin(schema);
    case 'prisma': return genPrisma(schema);
    case 'mongoose': return genMongoose(schema);
    default: return genTsInterface(schema);
  }
}

// Generators
function getTsType(f: Field) {
  let t = f.type === 'date' ? 'Date' : f.type;
  if (f.isArray) t += '[]';
  return t;
}

function genTsInterface(s: Schema) {
  let out = `export interface ${s.name} {\n`;
  for (const f of s.fields) {
    out += `  ${f.name}${f.optional ? '?' : ''}: ${getTsType(f)};\n`;
  }
  out += `}`;
  return out;
}

function genTsType(s: Schema) {
  let out = `export type ${s.name} = {\n`;
  for (const f of s.fields) {
    out += `  ${f.name}${f.optional ? '?' : ''}: ${getTsType(f)};\n`;
  }
  out += `};`;
  return out;
}

function genZod(s: Schema) {
  let out = `import { z } from "zod";\n\nexport const ${s.name}Schema = z.object({\n`;
  for (const f of s.fields) {
    let zType = 'z.any()';
    if (f.type === 'string') zType = 'z.string()';
    else if (f.type === 'number') zType = 'z.number()';
    else if (f.type === 'boolean') zType = 'z.boolean()';
    else if (f.type === 'date') zType = 'z.date()';
    
    if (f.isArray) zType = `z.array(${zType})`;
    if (f.optional) zType += '.optional()';
    
    out += `  ${f.name}: ${zType},\n`;
  }
  out += `});\n\nexport type ${s.name} = z.infer<typeof ${s.name}Schema>;`;
  return out;
}

function getPyType(f: Field) {
  let t = 'Any';
  if (f.type === 'string') t = 'str';
  else if (f.type === 'number') t = 'float';
  else if (f.type === 'boolean') t = 'bool';
  else if (f.type === 'date') t = 'datetime';
  else t = f.type;
  
  if (f.isArray) t = `List[${t}]`;
  if (f.optional) t = `Optional[${t}]`;
  return t;
}

function genPydantic(s: Schema) {
  let out = `from typing import List, Optional, Any\nfrom datetime import datetime\nfrom pydantic import BaseModel\n\nclass ${s.name}(BaseModel):\n`;
  if (s.fields.length === 0) out += `    pass\n`;
  for (const f of s.fields) {
    out += `    ${f.name}: ${getPyType(f)}\n`;
  }
  return out;
}

function genDataclass(s: Schema) {
  let out = `from typing import List, Optional, Any\nfrom datetime import datetime\nfrom dataclasses import dataclass\n\n@dataclass\nclass ${s.name}:\n`;
  if (s.fields.length === 0) out += `    pass\n`;
  for (const f of s.fields) {
    out += `    ${f.name}: ${getPyType(f)}\n`;
  }
  return out;
}

function genSql(s: Schema, flavor: 'postgres' | 'mysql') {
  let out = `CREATE TABLE ${s.name.toLowerCase()} (\n`;
  const lines = [];
  for (const f of s.fields) {
    let t = 'VARCHAR(255)';
    if (f.type === 'number') t = flavor === 'postgres' ? 'DOUBLE PRECISION' : 'DOUBLE';
    else if (f.type === 'boolean') t = 'BOOLEAN';
    else if (f.type === 'date') t = 'TIMESTAMP';
    else if (f.type === 'string') t = 'VARCHAR(255)';
    
    if (f.isArray && flavor === 'postgres') t += '[]';
    else if (f.isArray) t = 'JSON'; // MySQL fallback
    
    let line = `  ${f.name} ${t}`;
    if (!f.optional) line += ' NOT NULL';
    lines.push(line);
  }
  out += lines.join(',\n') + '\n);';
  return out;
}

function genJsonSchema(s: Schema) {
  const props: any = {};
  const required: string[] = [];
  
  for (const f of s.fields) {
    let t = 'string';
    if (f.type === 'number') t = 'number';
    else if (f.type === 'boolean') t = 'boolean';
    else if (f.type === 'date') t = 'string'; // format: date-time
    
    let propDef: any = { type: t };
    if (f.type === 'date') propDef.format = 'date-time';
    
    if (f.isArray) {
      propDef = { type: 'array', items: propDef };
    }
    
    props[f.name] = propDef;
    if (!f.optional) required.push(f.name);
  }
  
  const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: s.name,
    type: "object",
    properties: props,
    ...(required.length > 0 ? { required } : {})
  };
  
  return JSON.stringify(schema, null, 2);
}

function genGraphql(s: Schema) {
  let out = `type ${s.name} {\n`;
  for (const f of s.fields) {
    let t = 'String';
    if (f.type === 'number') t = 'Float';
    else if (f.type === 'boolean') t = 'Boolean';
    else if (f.type === 'date') t = 'DateTime';
    else if (f.type !== 'string' && f.type !== 'any') t = f.type;
    
    if (f.isArray) t = `[${t}${f.optional ? '' : '!'}]`;
    if (!f.optional) t += '!';
    
    out += `  ${f.name}: ${t}\n`;
  }
  out += `}`;
  return out;
}

function genProtobuf(s: Schema) {
  let out = `syntax = "proto3";\n\nmessage ${s.name} {\n`;
  let i = 1;
  for (const f of s.fields) {
    let t = 'string';
    if (f.type === 'number') t = 'double';
    else if (f.type === 'boolean') t = 'bool';
    else if (f.type === 'date') t = 'string'; // or google.protobuf.Timestamp
    else if (f.type !== 'string' && f.type !== 'any') t = f.type;
    
    let prefix = f.isArray ? 'repeated ' : (f.optional ? 'optional ' : '');
    out += `  ${prefix}${t} ${f.name} = ${i++};\n`;
  }
  out += `}`;
  return out;
}

function genRust(s: Schema) {
  let out = `use serde::{Serialize, Deserialize};\n\n#[derive(Debug, Serialize, Deserialize)]\npub struct ${s.name} {\n`;
  for (const f of s.fields) {
    let t = 'String';
    if (f.type === 'number') t = 'f64';
    else if (f.type === 'boolean') t = 'bool';
    else if (f.type === 'date') t = 'chrono::DateTime<chrono::Utc>';
    else if (f.type !== 'string' && f.type !== 'any') t = f.type;
    
    if (f.isArray) t = `Vec<${t}>`;
    if (f.optional) t = `Option<${t}>`;
    
    out += `    pub ${f.name}: ${t},\n`;
  }
  out += `}`;
  return out;
}

function genGo(s: Schema) {
  let out = `type ${s.name} struct {\n`;
  for (const f of s.fields) {
    let t = 'string';
    if (f.type === 'number') t = 'float64';
    else if (f.type === 'boolean') t = 'bool';
    else if (f.type === 'date') t = 'time.Time';
    else if (f.type !== 'string' && f.type !== 'any') t = f.type;
    
    if (f.isArray) t = `[]${t}`;
    if (f.optional && !f.isArray) t = `*${t}`;
    
    const jsonTag = f.optional ? `\`json:"${f.name},omitempty"\`` : `\`json:"${f.name}"\``;
    // Capitalize field name for export
    const exportName = f.name.charAt(0).toUpperCase() + f.name.slice(1);
    out += `\t${exportName} ${t} ${jsonTag}\n`;
  }
  out += `}`;
  return out;
}

function genJava(s: Schema) {
  let out = `import java.util.List;\nimport java.util.Date;\n\npublic class ${s.name} {\n`;
  for (const f of s.fields) {
    let t = 'String';
    if (f.type === 'number') t = f.optional ? 'Double' : 'double';
    else if (f.type === 'boolean') t = f.optional ? 'Boolean' : 'boolean';
    else if (f.type === 'date') t = 'Date';
    else if (f.type !== 'string' && f.type !== 'any') t = f.type;
    
    if (f.isArray) t = `List<${t}>`;
    
    out += `    private ${t} ${f.name};\n`;
  }
  out += `\n    // Getters and Setters omitted for brevity\n}`;
  return out;
}

function genCsharp(s: Schema) {
  let out = `using System;\nusing System.Collections.Generic;\n\npublic class ${s.name} {\n`;
  for (const f of s.fields) {
    let t = 'string';
    if (f.type === 'number') t = 'double';
    else if (f.type === 'boolean') t = 'bool';
    else if (f.type === 'date') t = 'DateTime';
    else if (f.type !== 'string' && f.type !== 'any') t = f.type;
    
    if (f.isArray) t = `List<${t}>`;
    if (f.optional && t !== 'string' && !f.isArray) t += '?';
    
    const propName = f.name.charAt(0).toUpperCase() + f.name.slice(1);
    out += `    public ${t} ${propName} { get; set; }\n`;
  }
  out += `}`;
  return out;
}

function genSwift(s: Schema) {
  let out = `import Foundation\n\nstruct ${s.name}: Codable {\n`;
  for (const f of s.fields) {
    let t = 'String';
    if (f.type === 'number') t = 'Double';
    else if (f.type === 'boolean') t = 'Bool';
    else if (f.type === 'date') t = 'Date';
    else if (f.type !== 'string' && f.type !== 'any') t = f.type;
    
    if (f.isArray) t = `[${t}]`;
    if (f.optional) t += '?';
    
    out += `    var ${f.name}: ${t}\n`;
  }
  out += `}`;
  return out;
}

function genKotlin(s: Schema) {
  let out = `import java.util.Date\n\ndata class ${s.name}(\n`;
  const lines = [];
  for (const f of s.fields) {
    let t = 'String';
    if (f.type === 'number') t = 'Double';
    else if (f.type === 'boolean') t = 'Boolean';
    else if (f.type === 'date') t = 'Date';
    else if (f.type !== 'string' && f.type !== 'any') t = f.type;
    
    if (f.isArray) t = `List<${t}>`;
    if (f.optional) t += '? = null';
    
    lines.push(`    val ${f.name}: ${t}`);
  }
  out += lines.join(',\n') + '\n)';
  return out;
}

function genPrisma(s: Schema) {
  let out = `model ${s.name} {\n`;
  // Add an id field if none exists
  if (!s.fields.find(f => f.name.toLowerCase() === 'id')) {
    out += `  id String @id @default(uuid())\n`;
  }
  for (const f of s.fields) {
    if (f.name.toLowerCase() === 'id') {
      out += `  ${f.name} String @id @default(uuid())\n`;
      continue;
    }
    let t = 'String';
    if (f.type === 'number') t = 'Float';
    else if (f.type === 'boolean') t = 'Boolean';
    else if (f.type === 'date') t = 'DateTime';
    else if (f.type !== 'string' && f.type !== 'any') t = f.type;
    
    if (f.isArray) t += '[]';
    else if (f.optional) t += '?';
    
    out += `  ${f.name} ${t}\n`;
  }
  out += `}`;
  return out;
}

function genMongoose(s: Schema) {
  let out = `import mongoose from 'mongoose';\n\nconst ${s.name.toLowerCase()}Schema = new mongoose.Schema({\n`;
  for (const f of s.fields) {
    let t = 'String';
    if (f.type === 'number') t = 'Number';
    else if (f.type === 'boolean') t = 'Boolean';
    else if (f.type === 'date') t = 'Date';
    else if (f.type !== 'string' && f.type !== 'any') t = 'mongoose.Schema.Types.Mixed';
    
    let typeDef = f.isArray ? `[${t}]` : t;
    
    out += `  ${f.name}: {\n    type: ${typeDef},\n    required: ${!f.optional}\n  },\n`;
  }
  out += `}, { timestamps: true });\n\nexport const ${s.name} = mongoose.model('${s.name}', ${s.name.toLowerCase()}Schema);`;
  return out;
}
