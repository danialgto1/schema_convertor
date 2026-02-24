import { useState, useEffect } from 'react';
import { ArrowRightLeft, Copy, Check, Loader2, Sparkles, Code2, Zap, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/themes/prism-tomorrow.css'; // Dark theme for prism
import { parseSource, generateCode } from './lib/converter';

const FORMATS = [
  { id: 'auto', label: 'Auto-detect', sourceOnly: true, prism: 'typescript' },
  { id: 'ts-interface', label: 'TypeScript Interface', prism: 'typescript' },
  { id: 'ts-type', label: 'TypeScript Type', prism: 'typescript' },
  { id: 'zod', label: 'Zod Schema', prism: 'typescript' },
  { id: 'pydantic', label: 'Python Pydantic', prism: 'python' },
  { id: 'dataclass', label: 'Python Dataclass', prism: 'python' },
  { id: 'sql-postgres', label: 'PostgreSQL Table', prism: 'sql' },
  { id: 'sql-mysql', label: 'MySQL Table', prism: 'sql' },
  { id: 'json-schema', label: 'JSON Schema', prism: 'json' },
  { id: 'graphql', label: 'GraphQL Type', prism: 'graphql' },
  { id: 'protobuf', label: 'Protobuf Message', prism: 'typescript' }, // fallback
  { id: 'rust', label: 'Rust Struct', prism: 'rust' },
  { id: 'go', label: 'Go Struct', prism: 'go' },
  { id: 'java', label: 'Java Class', prism: 'java' },
  { id: 'csharp', label: 'C# Class', prism: 'csharp' },
  { id: 'swift', label: 'Swift Struct', prism: 'swift' },
  { id: 'kotlin', label: 'Kotlin Data Class', prism: 'kotlin' },
  { id: 'prisma', label: 'Prisma Model', prism: 'typescript' }, // fallback
  { id: 'mongoose', label: 'Mongoose Schema', prism: 'typescript' },
];

const DEFAULT_SAMPLE = `interface User {
  id: string;
  name: string;
  email?: string;
  age: number;
  isActive: boolean;
  tags: string[];
}`;

export default function App() {
  const [sourceFormat, setSourceFormat] = useState('auto');
  const [targetFormat, setTargetFormat] = useState('ts-interface');
  const [sourceCode, setSourceCode] = useState(DEFAULT_SAMPLE);
  const [targetCode, setTargetCode] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleConvert(sourceCode, sourceFormat, targetFormat);
    }, 300); // Debounce conversion
    return () => clearTimeout(timer);
  }, [sourceCode, sourceFormat, targetFormat]);

  const handleConvert = (source: string, sFormat: string, tFormat: string) => {
    if (!source.trim()) {
      setTargetCode('');
      setError(null);
      return;
    }

    setIsConverting(true);
    setError(null);

    try {
      const schemas = parseSource(source, sFormat);
      const generated = generateCode(schemas, tFormat);
      setTargetCode(generated);
    } catch (err: any) {
      console.error('Conversion error:', err);
      setError(err.message || 'An error occurred during conversion.');
    } finally {
      setIsConverting(false);
    }
  };

  const handleCopy = async () => {
    if (!targetCode) return;
    try {
      await navigator.clipboard.writeText(targetCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleSwap = () => {
    if (sourceFormat !== 'auto') {
      setSourceFormat(targetFormat);
      setTargetFormat(sourceFormat);
      setSourceCode(targetCode);
    }
  };

  const getPrismLanguage = (formatId: string) => {
    const format = FORMATS.find(f => f.id === formatId);
    return format?.prism || 'typescript';
  };

  const highlightCode = (code: string, formatId: string) => {
    const lang = getPrismLanguage(formatId);
    try {
      return Prism.highlight(code, Prism.languages[lang] || Prism.languages.typescript, lang);
    } catch (e) {
      return code;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    const { selectionStart, selectionEnd, value } = target;

    if (e.key === 'Tab') {
      e.preventDefault();
      const newValue = value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd);
      setSourceCode(newValue);
      
      // Move cursor after the inserted spaces
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = selectionStart + 2;
      }, 0);
    } else if (e.key === '{') {
      e.preventDefault();
      const newValue = value.substring(0, selectionStart) + '{}' + value.substring(selectionEnd);
      setSourceCode(newValue);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = selectionStart + 1;
      }, 0);
    } else if (e.key === '[') {
      e.preventDefault();
      const newValue = value.substring(0, selectionStart) + '[]' + value.substring(selectionEnd);
      setSourceCode(newValue);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = selectionStart + 1;
      }, 0);
    } else if (e.key === '(') {
      e.preventDefault();
      const newValue = value.substring(0, selectionStart) + '()' + value.substring(selectionEnd);
      setSourceCode(newValue);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = selectionStart + 1;
      }, 0);
    } else if (e.key === 'Enter') {
      // Auto-indent on enter
      const lines = value.substring(0, selectionStart).split('\n');
      const currentLine = lines[lines.length - 1];
      const indentMatch = currentLine.match(/^\s*/);
      let indent = indentMatch ? indentMatch[0] : '';
      
      // Increase indent if previous line ends with { or [
      if (currentLine.trim().endsWith('{') || currentLine.trim().endsWith('[')) {
        indent += '  ';
      }

      e.preventDefault();
      const newValue = value.substring(0, selectionStart) + '\n' + indent + value.substring(selectionEnd);
      setSourceCode(newValue);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = selectionStart + 1 + indent.length;
      }, 0);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans overflow-x-hidden">
      {/* Header */}
      <motion.header 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="glass-panel sticky top-0 z-20 border-b-0 border-x-0 rounded-none"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="bg-[#E94560] p-2.5 rounded-xl text-white shadow-lg shadow-[#E94560]/30">
              <Layers size={22} strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight"> Schema Convertor</h1>
          </motion.div>
          <div className="flex items-center gap-4 text-sm text-[#A0A0B0] font-medium">
            <motion.span 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full text-xs border border-white/10 shadow-sm text-[#EEEEEE]"
            >
              <Zap size={14} className="text-[#E94560]" fill="#E94560" />
              Local Engine
            </motion.span>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 flex flex-col relative z-10">
        
        {/* Controls */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8 glass-panel p-5 rounded-3xl"
        >
          <div className="flex-1 w-full flex flex-col sm:flex-row items-center gap-4">
            <div className="w-full sm:w-64 relative group">
              <label className="block text-xs font-bold text-[#A0A0B0] uppercase tracking-widest mb-2 ml-1">Source</label>
              <select 
                value={sourceFormat}
                onChange={(e) => setSourceFormat(e.target.value)}
                className="w-full glass-input text-white font-medium text-sm rounded-xl focus:ring-2 focus:ring-[#E94560]/50 focus:border-[#E94560] block p-3 outline-none transition-all duration-300 appearance-none cursor-pointer"
              >
                {FORMATS.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <div className="absolute right-3 bottom-3.5 pointer-events-none text-[#A0A0B0] group-hover:text-[#E94560] transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>

            <motion.button 
              whileHover={{ scale: 1.1, rotate: 180 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 200, damping: 10 }}
              onClick={handleSwap}
              disabled={sourceFormat === 'auto'}
              className="mt-6 p-3 rounded-full bg-white/5 hover:bg-white/10 text-[#A0A0B0] hover:text-[#E94560] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm border border-white/10"
              title="Swap formats"
            >
              <ArrowRightLeft size={18} strokeWidth={2.5} />
            </motion.button>

            <div className="w-full sm:w-64 relative group">
              <label className="block text-xs font-bold text-[#A0A0B0] uppercase tracking-widest mb-2 ml-1">Target</label>
              <select 
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value)}
                className="w-full glass-input text-white font-medium text-sm rounded-xl focus:ring-2 focus:ring-[#E94560]/50 focus:border-[#E94560] block p-3 outline-none transition-all duration-300 appearance-none cursor-pointer"
              >
                {FORMATS.filter(f => !f.sourceOnly).map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <div className="absolute right-3 bottom-3.5 pointer-events-none text-[#A0A0B0] group-hover:text-[#E94560] transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              className="mb-6 overflow-hidden"
            >
              <div className="p-4 bg-red-500/10 backdrop-blur-md border border-red-500/20 text-red-400 rounded-2xl text-sm font-medium shadow-sm">
                {error}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Editors */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-[550px]">
          {/* Source Editor */}
          <motion.div 
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            className="flex flex-col glass-editor rounded-3xl overflow-hidden group"
          >
            <div className="bg-black/40 px-5 py-4 flex items-center justify-between border-b border-white/5">
              <span className="text-[#A0A0B0] text-sm font-bold flex items-center gap-2 tracking-wide uppercase">
                <Code2 size={16} />
                Input Schema
              </span>
            </div>
            <div className="relative flex-1 overflow-auto custom-scrollbar flex">
              <div 
                className="py-5 pl-4 pr-3 text-right text-white/20 select-none font-mono text-[13px] border-r border-white/5 bg-black/20"
                style={{ lineHeight: 1.5 }}
              >
                {sourceCode.split('\n').map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <Editor
                value={sourceCode}
                onValueChange={code => setSourceCode(code)}
                highlight={code => highlightCode(code, sourceFormat)}
                padding={20}
                onKeyDown={handleKeyDown}
                style={{
                  fontFamily: '"Fira Code", monospace',
                  fontSize: 13,
                  minHeight: '100%',
                  backgroundColor: 'transparent',
                  color: '#EEEEEE',
                  flex: 1,
                  lineHeight: 1.5,
                }}
                textareaClassName="focus:outline-none"
              />
            </div>
          </motion.div>

          {/* Target Editor */}
          <motion.div 
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="flex flex-col glass-editor rounded-3xl overflow-hidden relative group"
          >
            <div className="bg-black/40 px-5 py-4 flex items-center justify-between border-b border-white/5">
              <span className="text-[#A0A0B0] text-sm font-bold flex items-center gap-2 tracking-wide uppercase">
                <Sparkles size={16} />
                Output Schema
              </span>
              <div className="flex items-center gap-3">
                <AnimatePresence>
                  {isConverting && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    >
                      <Loader2 size={16} className="text-[#E94560] animate-spin" />
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCopy}
                  disabled={!targetCode}
                  className="text-[#A0A0B0] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 text-xs font-bold bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copied ? 'COPIED' : 'COPY'}
                </motion.button>
              </div>
            </div>
            
            <div className="relative flex-1 overflow-auto custom-scrollbar flex">
              <div 
                className="py-5 pl-4 pr-3 text-right text-white/20 select-none font-mono text-[13px] border-r border-white/5 bg-black/20"
                style={{ lineHeight: 1.5 }}
              >
                {targetCode.split('\n').map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <Editor
                value={targetCode}
                onValueChange={() => {}} // Read only
                highlight={code => highlightCode(code, targetFormat)}
                padding={20}
                style={{
                  fontFamily: '"Fira Code", monospace',
                  fontSize: 13,
                  minHeight: '100%',
                  backgroundColor: 'transparent',
                  color: '#EEEEEE',
                  flex: 1,
                  lineHeight: 1.5,
                }}
                textareaClassName="focus:outline-none"
              />
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
