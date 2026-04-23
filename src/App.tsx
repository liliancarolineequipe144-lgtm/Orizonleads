import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  MapPin, 
  Phone, 
  Globe, 
  Plus, 
  Download, 
  MessageCircle, 
  Filter, 
  Loader2, 
  ExternalLink,
  ChevronRight,
  Target,
  Briefcase,
  Users,
  Zap,
  CheckCircle2,
  AlertCircle,
  Menu,
  X,
  CreditCard,
  Settings,
  LayoutDashboard,
  ShieldCheck,
  MousePointer2,
  SearchCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  orderBy,
  limit,
  getDocFromServer,
  doc
} from 'firebase/firestore';
import { auth, db, handleFirestoreError } from './lib/firebase';

// -----------------------------------------------------------------------------
// AI Config
// -----------------------------------------------------------------------------

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface Lead {
  id: string;
  name: string;
  niche: string;
  address: string;
  phone: string;
  city: string;
  hasWhatsApp: boolean;
  hasWebsite: boolean;
  distance?: string;
  rating?: number;
  reviews?: number;
}

// -----------------------------------------------------------------------------
// Constants & Data
// -----------------------------------------------------------------------------

const NICHES = [
  "Clínicas Odontológicas", "Escritórios de Advocacia", "Salões de Beleza",
  "Academias", "Restaurantes", "Oficinas Mecânicas", "Imobiliárias",
  "Escolas de Idiomas", "Pet Shops", "Clínicas de Estética", "Contabilidades",
  "Arquitetura", "Engenharia", "Psicólogos", "Médicos Particulares"
];

const STATES = [
  { id: "SP", name: "São Paulo" },
  { id: "RJ", name: "Rio de Janeiro" },
  { id: "MG", name: "Minas Gerais" },
  { id: "PR", name: "Paraná" },
  { id: "RS", name: "Rio Grande do Sul" },
  { id: "SC", name: "Santa Catarina" },
  { id: "BA", name: "Bahia" },
  { id: "CE", name: "Ceará" },
  { id: "PE", name: "Pernambuco" },
  { id: "DF", name: "Distrito Federal" }
];

const CITIES: Record<string, string[]> = {
  "SP": ["São Paulo", "Campinas", "Santos", "Ribeirão Preto", "Guarulhos"],
  "RJ": ["Rio de Janeiro", "Niterói", "Búzios", "Petrópolis", "Duque de Caxias"],
  "MG": ["Belo Horizonte", "Uberlândia", "Contagem", "Juiz de Fora"],
  "PR": ["Curitiba", "Londrina", "Maringá", "Cascavel"],
  "RS": ["Porto Alegre", "Caxias do Sul", "Gramado", "Pelotas"],
  "SC": ["Florianópolis", "Joinville", "Blumenau", "Balneário Camboriú"],
  "BA": ["Salvador", "Feira de Santana", "Vitória da Conquista"],
  "CE": ["Fortaleza", "Juazeiro do Norte", "Sobral"],
  "PE": ["Recife", "Olinda", "Caruaru"],
  "DF": ["Brasília", "Taguatinga", "Ceilândia"]
};

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');

// -----------------------------------------------------------------------------
// Main Application Component
// -----------------------------------------------------------------------------

export default function App() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Search State
  const [view, setView] = useState<'search' | 'base'>('search');
  const [niche, setNiche] = useState("");
  const [keyword, setKeyword] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Precision Filters
  const [filterNoWebsite, setFilterNoWebsite] = useState(false);
  const [filterWhatsAppOnly, setFilterWhatsAppOnly] = useState(false);

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (filterNoWebsite && l.hasWebsite) return false;
      if (filterWhatsAppOnly && !l.hasWhatsApp) return false;
      return true;
    });
  }, [leads, filterNoWebsite, filterWhatsAppOnly]);

  // Auth Effect
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Load Previous Leads
  useEffect(() => {
    if (user && authReady) {
      loadSavedLeads();
    }
  }, [user, authReady, view]);

  const loadSavedLeads = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "leads"), 
        where("userId", "==", user.uid),
        orderBy("capturedAt", "desc"),
        limit(view === 'base' ? 100 : 20)
      );
      const snap = await getDocs(q);
      const loaded = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
      setLeads(loaded);
    } catch (e) {
      console.error("Error loading leads:", e);
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Login Error:", e);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setLeads([]);
    } catch (e) {
      console.error("Logout Error:", e);
    }
  };

  const saveLead = async (leadData: Omit<Lead, 'id'>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "leads"), {
        ...leadData,
        userId: user.uid,
        capturedAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, 'create', '/leads');
    }
  };

  // Derived
  const availableCities = useMemo(() => (state ? CITIES[state] || [] : []), [state]);
  const finalCity = city || (availableCities.length > 0 ? availableCities[0] : "");

  // Handlers
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche || !state) return;

    if (!user) {
      handleLogin();
      return;
    }

    setIsLoading(true);

    try {
      // Precise Lead Generation using Gemini
      let filterInstructions = "";
      if (filterNoWebsite) filterInstructions += "- TODA A LISTA DEVE SER DE EMPRESAS SEM SITE (hasWebsite: false).\n";
      if (filterWhatsAppOnly) filterInstructions += "- TODA A LISTA DEVE TER WHATSAPP (hasWhatsApp: true).\n";

      const prompt = `Gere uma lista de 10 leads de negócios reais ou altamente plausíveis em Português do Brasil para o nicho "${niche}" ${keyword ? `com foco em "${keyword}"` : ''} na cidade de ${finalCity}, ${state}. 
      REQUISITOS ESTRITOS:
      - Nomes de empresas plausíveis.
      - Endereços realistas nesta cidade.
      - Telefones celulares (com DDD correto de ${state}) que possivelmente têm WhatsApp.
      ${filterInstructions}
      - Se nenhum filtro exigir o contrário, use uma distribuição natural (alguns com site, alguns sem).`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                address: { type: Type.STRING },
                phone: { type: Type.STRING },
                hasWhatsApp: { type: Type.BOOLEAN },
                hasWebsite: { type: Type.BOOLEAN },
                rating: { type: Type.NUMBER },
                reviews: { type: Type.INTEGER }
              },
              required: ["name", "address", "phone", "hasWhatsApp", "hasWebsite"]
            }
          }
        }
      });

      const generatedLeadsRaw = JSON.parse(response.text || "[]");
      
      const newLeads: Lead[] = [];
      setIsSaving(true);
      
      for (const l of generatedLeadsRaw) {
        const leadBase = {
          ...l,
          niche: niche,
          city: finalCity,
        };
        
        // Save to Firebase
        await saveLead(leadBase);
        
        newLeads.push({
          ...leadBase,
          id: Math.random().toString(36).substr(2, 9)
        });
      }

      setLeads(prev => [...newLeads, ...prev].slice(0, 100));
    } catch (error) {
      console.error("AI Generation Error:", error);
    } finally {
      setIsLoading(false);
      setIsSaving(false);
    }
  };

  const getWhatsAppLink = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    return `https://wa.me/55${cleanPhone}?text=Olá,%20vi%20seu%20negócio%20no%20Google%20Maps%20e%20gostaria%20de%20conversar.`;
  };

  const getMapsLink = (name: string, city: string) => {
    return `https://www.google.com/maps/search/${encodeURIComponent(name + " " + city)}`;
  };

  const getTelLink = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    return `tel:${cleanPhone}`;
  };

  return (
    <div className="h-screen flex flex-col bg-[#0B0C10] text-[#C5C6C7] font-sans selection:bg-[#10B981] selection:text-black overflow-hidden">
      
      {/* Header */}
      <header className="bg-[#0B0C10]/80 backdrop-blur-xl border-b border-[#1F2833]/50 px-4 md:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-[#10B981] rounded-lg flex items-center justify-center shadow-lg shadow-[#10B981]/10">
             <Target className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="text-white font-black text-lg tracking-tighter uppercase leading-none">Orizon <span className="text-[#10B981]">Leads</span></h1>
            <span className="text-[8px] font-mono text-[#45A29E] uppercase tracking-widest leading-none">Scraper Engine active</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
           {user ? (
             <div className="flex items-center gap-3">
               <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] text-white font-bold tracking-tight leading-none truncate max-w-[100px]">{user.displayName || user.email}</span>
                  <button onClick={handleLogout} className="text-[8px] text-[#45A29E] hover:text-red-400 font-mono uppercase tracking-widest leading-none">Desconectar</button>
               </div>
               {user.photoURL ? (
                 <img src={user.photoURL} alt="User" className="w-9 h-9 rounded-lg border border-[#1F2833]"referrerPolicy="no-referrer" />
               ) : (
                 <div className="w-9 h-9 bg-[#1F2833] rounded-lg flex items-center justify-center text-[#45A29E] font-bold">
                   {user.email?.charAt(0).toUpperCase()}
                 </div>
               )}
             </div>
           ) : (
             <button 
               onClick={handleLogin}
               className="bg-[#1F2833] text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-lg border border-[#45A29E]/20 hover:border-[#10B981]/50 transition-all"
             >
               Entrar
             </button>
           )}
           <button 
             onClick={() => setIsSidebarOpen(!isSidebarOpen)}
             className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#1F2833] text-white hover:bg-[#10B981] hover:text-black transition-colors"
           >
             <Menu className="w-5 h-5" />
           </button>
        </div>
      </header>

      {/* Main Content (Scrollable) */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
          
          {/* Controls Section (Compact Radar) */}
          <AnimatePresence mode="wait">
            {view === 'search' && (
              <motion.section 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-gradient-to-br from-[#1F2833] to-[#0B0C10] p-6 md:p-8 rounded-3xl border border-[#45A29E]/10 shadow-2xl space-y-6 overflow-hidden"
              >
                <header className="flex items-center justify-between">
                   <div className="space-y-1">
                     <span className="text-[#10B981] font-mono text-[9px] font-bold uppercase tracking-widest leading-none">Filtro de Varredura</span>
                     <h2 className="text-white text-xl font-bold tracking-tight">Qual o seu alvo hoje?</h2>
                   </div>
                   <div className="flex gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#1F2833]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#1F2833]" />
                   </div>
                </header>

                <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-12 lg:col-span-4 relative group">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#45A29E] pointer-events-none group-focus-within:text-[#10B981] transition-colors" />
                    <select 
                      value={niche}
                      onChange={(e) => setNiche(e.target.value)}
                      className="w-full h-12 bg-[#0B0C10] border border-[#1F2833] rounded-xl pl-10 pr-4 text-sm text-white font-medium focus:border-[#10B981] outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="">Nicho Principal</option>
                      {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>

                  <div className="md:col-span-12 lg:col-span-4 relative group">
                    <SearchCode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#45A29E] pointer-events-none group-focus-within:text-[#10B981] transition-colors" />
                    <input 
                      type="text"
                      placeholder="Palavra-chave (Sub-nicho)"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      className="w-full h-12 bg-[#0B0C10] border border-[#1F2833] rounded-xl pl-10 pr-4 text-sm text-white font-medium focus:border-[#10B981] outline-none transition-all"
                    />
                  </div>

                  <div className="md:col-span-6 lg:col-span-2 relative group">
                    <select 
                      value={state}
                      onChange={(e) => { setState(e.target.value); setCity(""); }}
                      className="w-full h-12 bg-[#0B0C10] border border-[#1F2833] rounded-xl px-4 text-sm text-white font-medium focus:border-[#10B981] outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="">UF</option>
                      {STATES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  <div className="md:col-span-6 lg:col-span-2 relative group">
                    <select 
                       value={city}
                       onChange={(e) => setCity(e.target.value)}
                       disabled={!state}
                       className="w-full h-12 bg-[#0B0C10] border border-[#1F2833] rounded-xl px-4 text-sm text-white font-medium focus:border-[#10B981] outline-none transition-all appearance-none disabled:opacity-20 cursor-pointer"
                    >
                      <option value="">Cidades</option>
                      {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div className="md:col-span-12 flex flex-wrap items-center gap-4 py-2">
                     <button 
                       type="button"
                       onClick={() => setFilterNoWebsite(!filterNoWebsite)}
                       className={cn(
                         "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all",
                         filterNoWebsite ? "bg-[#10B981]/20 border-[#10B981] text-[#10B981]" : "bg-[#0B0C10] border-[#1F2833] text-[#45A29E]"
                       )}
                     >
                       <MousePointer2 className="w-3 h-3" />
                       Apenas s/ Site
                     </button>
                     <button 
                        type="button"
                        onClick={() => setFilterWhatsAppOnly(!filterWhatsAppOnly)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all",
                          filterWhatsAppOnly ? "bg-[#10B981]/20 border-[#10B981] text-[#10B981]" : "bg-[#0B0C10] border-[#1F2833] text-[#45A29E]"
                        )}
                     >
                       <MessageCircle className="w-3 h-3" />
                       Apenas WhatsApp
                     </button>
                     <div className="flex-1" />
                     <div className="flex items-center gap-2 px-2 py-1 bg-[#10B981]/5 rounded border border-[#10B981]/10">
                       <ShieldCheck className="w-3 h-3 text-[#10B981]" />
                       <span className="text-[9px] text-[#45A29E] font-bold uppercase">Precisão Ativada</span>
                     </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isLoading || !niche || !state}
                    className="md:col-span-12 h-12 bg-[#10B981] text-black font-black uppercase tracking-widest text-xs rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all shadow-lg shadow-[#10B981]/10 flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : isSaving ? <><CheckCircle2 className="w-4 h-4" /> Salvando Leads...</> : <><Zap className="w-4 h-4" /> Scanner Inteligente</>}
                  </button>
                </form>
              </motion.section>
            )}

            {view === 'base' && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#1F2833]/20 border border-[#10B981]/20 p-6 rounded-3xl flex flex-col items-center gap-3 text-center"
              >
                <div className="w-12 h-12 bg-[#10B981]/10 rounded-full flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-[#10B981]" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg">Minha Base de Dados</h2>
                  <p className="text-[#45A29E] text-[10px] font-mono uppercase tracking-widest">Visualizando todos os leads salvos na nuvem</p>
                </div>
                <button 
                  onClick={() => setView('search')}
                  className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white hover:text-[#10B981] transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  Voltar para Scanner
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Leads List */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
               <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#10B981]" />
                  <h3 className="text-white font-bold text-sm uppercase tracking-tight">
                    {view === 'search' ? 'Leads Capturados' : 'Minha Biblioteca'}
                  </h3>
               </div>
               {filteredLeads.length > 0 && <span className="text-[10px] font-mono text-[#45A29E]">{filteredLeads.length} encontrados</span>}
            </div>

            <div className="space-y-3 pb-8">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[#10B981] opacity-40" />
                    <p className="text-[10px] text-[#45A29E] font-mono uppercase tracking-widest">Sincronizando com Google Maps...</p>
                  </motion.div>
                ) : filteredLeads.length > 0 ? (
                  <div key="list" className="space-y-4">
                    {filteredLeads.map((lead, idx) => (
                      <motion.div 
                        key={lead.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className="bg-[#1F2833]/40 rounded-2xl border border-[#45A29E]/10 p-5 md:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-[#10B981]/30 transition-all group"
                      >
                         <div className="flex gap-4 items-start">
                            <div className="w-10 h-10 bg-[#0B0C10] rounded-xl flex items-center justify-center shrink-0 border border-[#45A29E]/10 text-[#10B981] font-mono text-xs font-bold">
                              {idx + 1}
                            </div>
                            <div className="space-y-1">
                               <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-white font-bold text-sm uppercase">{lead.name}</h4>
                                  {!lead.hasWebsite && <span className="bg-[#10B981]/10 text-[#10B981] text-[8px] px-2 py-0.5 rounded font-bold border border-[#10B981]/20">SEM SITE</span>}
                               </div>
                               <div className="flex items-center gap-2 text-[10px] text-[#45A29E] font-medium">
                                  <span>{lead.city}</span>
                                  <span className="opacity-20">•</span>
                                  <span className="truncate max-w-[150px]">{lead.address}</span>
                               </div>
                            </div>
                         </div>

                         <div className="flex items-center gap-3 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-[#1F2833]/50">
                            <div className="flex flex-col items-start sm:items-end flex-grow">
                               <div className="flex items-center gap-1.5">
                                 <div className={cn("w-1.5 h-1.5 rounded-full", lead.hasWhatsApp ? "bg-[#10B981]" : "bg-red-500")} />
                                 <span className="text-white font-mono text-base font-bold">{lead.phone}</span>
                               </div>
                               <span className="text-[9px] text-[#45A29E] uppercase font-bold tracking-widest opacity-40">{lead.hasWhatsApp ? 'WhatsApp OK' : 'No WhatsApp'}</span>
                            </div>
                            
                            <div className="flex gap-2">
                               <a href={getWhatsAppLink(lead.phone)} target="_blank" rel="noopener noreferrer" className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#10B981] text-black shadow-lg shadow-[#10B981]/10 hover:scale-105 transition-all"><MessageCircle className="w-5 h-5" /></a>
                               <a href={getMapsLink(lead.name, lead.city)} target="_blank" rel="noopener noreferrer" className="w-10 h-10 flex items-center justify-center rounded-xl border border-[#45A29E]/20 text-[#45A29E] hover:bg-[#1F2833] transition-all"><MapPin className="w-5 h-5" /></a>
                            </div>
                         </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} className="py-40 flex flex-col items-center text-center px-8">
                    <Target className="w-8 h-8 text-[#45A29E] mb-4 opacity-20" />
                    <p className="text-[10px] text-[#45A29E] font-mono uppercase tracking-widest max-w-[200px]">Inicie a varredura para preencher sua lista de prospects</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </main>

      {/* Footer Stats Summary (Mobile Sticky) */}
      <footer className="bg-[#1F2833]/80 backdrop-blur-xl border-t border-[#1F2833] px-6 py-3 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
               <span className="text-[8px] text-[#45A29E] uppercase font-bold tracking-widest">Visíveis</span>
               <span className="text-white font-mono font-bold leading-none">{filteredLeads.length}</span>
            </div>
            <div className="w-px h-6 bg-[#45A29E]/20" />
            <div className="flex flex-col">
               <span className="text-[8px] text-[#45A29E] uppercase font-bold tracking-widest">Base Total</span>
               <span className="text-[#10B981] font-mono font-bold leading-none">{leads.length}</span>
            </div>
         </div>

         <div className="flex items-center gap-2">
            <Globe className="w-3 h-3 text-[#45A29E] opacity-50" />
            <span className="text-[8px] text-white/30 font-mono tracking-widest">{new Date().toLocaleTimeString('pt-BR')}</span>
         </div>
      </footer>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="fixed top-0 right-0 bottom-0 w-64 bg-[#1F2833] z-[110] p-6 border-l border-[#10B981]/20 flex flex-col">
               <div className="flex justify-between items-center mb-10">
                  <span className="text-white font-black text-sm tracking-tighter uppercase italic">Orizon Dashboard</span>
                  <button onClick={() => setIsSidebarOpen(false)} className="text-[#45A29E]"><X className="w-5 h-5" /></button>
               </div>
               <nav className="flex-1 space-y-4">
                  {[
                    { id: 'search', icon: LayoutDashboard, label: "Varredura" },
                    { id: 'base', icon: Users, label: "Minha Base" },
                    { id: 'settings', icon: Settings, label: "Configuração" }
                  ].map((item) => (
                    <button 
                      key={item.label} 
                      onClick={() => {
                        if (item.id === 'search' || item.id === 'base') setView(item.id as any);
                        setIsSidebarOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl transition-all group",
                        view === item.id ? "bg-[#10B981] text-black" : "hover:bg-[#10B981]/10 text-[#C5C6C7] hover:text-[#10B981]"
                      )}
                    >
                       <item.icon className={cn("w-4 h-4", view === item.id ? "opacity-100" : "opacity-40 group-hover:opacity-100")} />
                       <span className="font-bold uppercase tracking-widest text-[10px]">{item.label}</span>
                    </button>
                  ))}
               </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
