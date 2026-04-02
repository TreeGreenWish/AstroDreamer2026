import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Moon, Book, User, Plus, Sparkles, Loader2, Trash2, ChevronLeft, Calendar, MapPin, Clock, Activity, Search, X, Tag as TagIcon, BarChart3 } from 'lucide-react';
import { UserProfile, Dream } from './types';
import { generateProfileAnalysis, interpretDream, generateDreamImage, getCurrentAstrology, getMonthAstrologyEvents, generateInsights } from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [activeTab, setActiveTab] = useState<'journal' | 'feed' | 'calendar' | 'library' | 'insights' | 'profile'>('journal');
  const [loading, setLoading] = useState(true);
  const [selectedDream, setSelectedDream] = useState<Dream | null>(null);
  const [currentAstrology, setCurrentAstrology] = useState<any>(null);
  const [monthlyEvents, setMonthlyEvents] = useState<any[]>([]);
  const [insights, setInsights] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profileRes, dreamsRes] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/dreams')
      ]);
      const profileData = await profileRes.json();
      const dreamsData = await dreamsRes.json();
      setProfile(profileData);
      setDreams(dreamsData);

      if (profileData) {
        const now = new Date();
        const [astro, events] = await Promise.all([
          getCurrentAstrology(
            profileData.lob_lat, 
            profileData.lob_lng, 
            format(now, 'yyyy-MM-dd'), 
            format(now, 'HH:mm')
          ),
          getMonthAstrologyEvents(format(now, 'MMMM'), format(now, 'yyyy'))
        ]);
        setCurrentAstrology(astro);
        setMonthlyEvents(events);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (newProfile: UserProfile) => {
    setLoading(true);
    try {
      const analysis = await generateProfileAnalysis(newProfile);
      const profileWithAnalysis = { ...newProfile, ...analysis };
      
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileWithAnalysis)
      });
      
      setProfile(profileWithAnalysis);

      const now = new Date();
      const [astro, events] = await Promise.all([
        getCurrentAstrology(
          profileWithAnalysis.lob_lat, 
          profileWithAnalysis.lob_lng, 
          format(now, 'yyyy-MM-dd'), 
          format(now, 'HH:mm')
        ),
        getMonthAstrologyEvents(format(now, 'MMMM'), format(now, 'yyyy'))
      ]);
      setCurrentAstrology(astro);
      setMonthlyEvents(events);
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDream = async (dream: Dream) => {
    setLoading(true);
    try {
      // 1. Interpret dream
      const aiResponse = await interpretDream(dream, profile!);
      if (!aiResponse) throw new Error("Failed to interpret dream");

      // 2. Generate image
      const imageUrl = await generateDreamImage(dream);
      
      const dreamWithAi = { 
        ...dream, 
        interpretation: aiResponse.interpretation,
        sun_sign: aiResponse.sun_sign,
        moon_sign: aiResponse.moon_sign,
        mercury_sign: aiResponse.mercury_sign,
        venus_sign: aiResponse.venus_sign,
        mars_sign: aiResponse.mars_sign,
        jupiter_sign: aiResponse.jupiter_sign,
        saturn_sign: aiResponse.saturn_sign,
        uranus_sign: aiResponse.uranus_sign,
        neptune_sign: aiResponse.neptune_sign,
        moon_phase: aiResponse.moon_phase,
        day_number: aiResponse.day_number,
        planetary_influences: aiResponse.planetary_influences,
        tags: aiResponse.tags,
        image_url: imageUrl || undefined 
      };
      
      const res = await fetch('/api/dreams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dreamWithAi)
      });
      
      if (!res.ok) throw new Error("Failed to save dream to database");

      const { id } = await res.json();
      const savedDream = { ...dreamWithAi, id };
      
      setDreams([savedDream, ...dreams]);
      setSelectedDream(savedDream);
      setActiveTab('library');
    } catch (error) {
      console.error('Failed to save dream:', error);
      alert("The cosmos are currently clouded. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDream = async (updatedDream: Dream) => {
    try {
      await fetch(`/api/dreams/${updatedDream.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDream)
      });
      setDreams(dreams.map(d => d.id === updatedDream.id ? updatedDream : d));
      setSelectedDream(updatedDream);
    } catch (error) {
      console.error('Failed to update dream:', error);
    }
  };

  const handleDeleteDream = async (id: number) => {
    try {
      await fetch(`/api/dreams/${id}`, { method: 'DELETE' });
      setDreams(dreams.filter(d => d.id !== id));
      if (selectedDream?.id === id) setSelectedDream(null);
    } catch (error) {
      console.error('Failed to delete dream:', error);
    }
  };

  if (loading && !profile && dreams.length === 0) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0a0502]">
        <div className="atmosphere" />
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!profile) {
    return <Onboarding onSave={handleSaveProfile} loading={loading} />;
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="atmosphere" />
      
      {/* Header */}
      <header className="p-6 flex justify-between items-center max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <Moon className="w-6 h-6 text-orange-500" />
          <h1 className="text-xl font-serif tracking-widest uppercase text-white/90">AstraDream</h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-white/40">
          <span>{profile.chinese_zodiac}</span>
          <span>•</span>
          <span>Path {profile.life_path}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6">
        <AnimatePresence mode="wait">
          {selectedDream ? (
            <DreamDetail 
              dream={selectedDream} 
              onBack={() => setSelectedDream(null)} 
              onDelete={() => handleDeleteDream(selectedDream.id!)}
              onUpdate={handleUpdateDream}
            />
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab === 'journal' && <DreamJournal onSave={handleSaveDream} loading={loading} />}
              {activeTab === 'feed' && <FeedView dreams={dreams} currentAstrology={currentAstrology} onSelect={setSelectedDream} />}
              {activeTab === 'calendar' && <AstralCalendar dreams={dreams} events={monthlyEvents} onSelect={setSelectedDream} />}
              {activeTab === 'library' && <Library dreams={dreams} onSelect={setSelectedDream} />}
              {activeTab === 'insights' && <InsightsView dreams={dreams} insights={insights} setInsights={setInsights} />}
              {activeTab === 'profile' && <ProfileView profile={profile} onEdit={() => setProfile(null)} />}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation */}
      {!selectedDream && (
        <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 glass rounded-full p-2 flex gap-2 z-50">
          <NavButton 
            active={activeTab === 'journal'} 
            onClick={() => setActiveTab('journal')}
            icon={<Plus className="w-5 h-5" />}
            label="Journal"
          />
          <NavButton 
            active={activeTab === 'feed'} 
            onClick={() => setActiveTab('feed')}
            icon={<Activity className="w-5 h-5" />}
            label="Feed"
          />
          <NavButton 
            active={activeTab === 'calendar'} 
            onClick={() => setActiveTab('calendar')}
            icon={<Calendar className="w-5 h-5" />}
            label="Calendar"
          />
          <NavButton 
            active={activeTab === 'library'} 
            onClick={() => setActiveTab('library')}
            icon={<Book className="w-5 h-5" />}
            label="Library"
          />
          <NavButton 
            active={activeTab === 'insights'} 
            onClick={() => setActiveTab('insights')}
            icon={<BarChart3 className="w-5 h-5" />}
            label="Insights"
          />
          <NavButton 
            active={activeTab === 'profile'} 
            onClick={() => setActiveTab('profile')}
            icon={<User className="w-5 h-5" />}
            label="Profile"
          />
        </nav>
      )}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300",
        active ? "bg-gold text-deep-blue shadow-lg shadow-gold/20 font-bold" : "text-white/40 hover:text-white/60"
      )}
    >
      {icon}
      {active && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}

// --- Sub-components ---

function Onboarding({ onSave, loading }: { onSave: (p: UserProfile) => void, loading: boolean }) {
  const [formData, setFormData] = useState<UserProfile>({
    name: '',
    dob: '',
    tob: '',
    lob_lat: 0,
    lob_lng: 0,
    lob_name: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.lob_name) {
      alert("Please select a location from the dropdown");
      return;
    }
    onSave(formData);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="atmosphere" />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass p-8 rounded-3xl w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Moon className="w-12 h-12 text-gold mx-auto mb-4" />
          <h2 className="text-3xl font-serif text-white mb-2">Welcome to AstraDream</h2>
          <p className="text-white/50 text-sm">To align your dreams with the cosmos, we need your birth details.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-white/40 mb-1 ml-1">Name</label>
            <input 
              required
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors"
              placeholder="Your name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/40 mb-1 ml-1">Date of Birth</label>
              <input 
                required
                type="date"
                value={formData.dob}
                onChange={e => setFormData({ ...formData, dob: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/40 mb-1 ml-1">Time of Birth</label>
              <input 
                required
                type="time"
                value={formData.tob}
                onChange={e => setFormData({ ...formData, tob: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-white/40 mb-1 ml-1">Birth Location</label>
            <LocationPicker 
              value={formData.lob_name}
              onChange={(name, lat, lng) => setFormData({ ...formData, lob_name: name, lob_lat: lat, lob_lng: lng })}
              placeholder="Search city, country..."
            />
          </div>
          
          <button 
            disabled={loading}
            type="submit"
            className="w-full bg-gold hover:bg-gold/80 text-deep-blue font-bold py-4 rounded-xl mt-4 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {loading ? 'Aligning Stars...' : 'Begin Your Journey'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function DreamJournal({ onSave, loading }: { onSave: (d: Dream) => void, loading: boolean }) {
  const [formData, setFormData] = useState<Dream>({
    title: '',
    content: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm'),
    location_lat: 0,
    location_lng: 0,
    location_name: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.location_name) {
      alert("Please select a location for your dream to align it with the stars.");
      return;
    }
    onSave(formData);
  };

  return (
    <div className="space-y-8">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-serif text-white mb-2">Record a Dream</h2>
        <p className="text-white/40">The stars were in a unique position when you dreamt this.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="glass p-8 rounded-3xl space-y-6">
          <input 
            required
            type="text"
            value={formData.title}
            onChange={e => setFormData({ ...formData, title: e.target.value })}
            className="w-full bg-transparent border-b border-white/10 text-3xl font-serif text-white placeholder:text-white/10 focus:outline-none focus:border-orange-500/50 py-2 transition-colors"
            placeholder="Dream Title..."
          />
          
          <textarea 
            required
            rows={8}
            value={formData.content}
            onChange={e => setFormData({ ...formData, content: e.target.value })}
            className="w-full bg-transparent text-lg text-white/80 placeholder:text-white/10 focus:outline-none resize-none leading-relaxed"
            placeholder="Describe your dream in detail..."
          />

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-white/30 ml-1">Personal Notes (Optional)</label>
            <textarea 
              rows={3}
              value={formData.notes || ''}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors text-sm"
              placeholder="Your initial ideas or notes..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-white/5">
            <div className="flex items-center gap-3 text-white/40">
              <Calendar className="w-4 h-4" />
              <input 
                type="date"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="bg-transparent text-sm focus:outline-none text-white/60"
              />
            </div>
            <div className="flex items-center gap-3 text-white/40">
              <Clock className="w-4 h-4" />
              <input 
                type="time"
                value={formData.time}
                onChange={e => setFormData({ ...formData, time: e.target.value })}
                className="bg-transparent text-sm focus:outline-none text-white/60"
              />
            </div>
            <div className="flex items-center gap-3 text-white/40">
              <MapPin className="w-4 h-4" />
              <LocationPicker 
                value={formData.location_name}
                onChange={(name, lat, lng) => setFormData({ ...formData, location_name: name, location_lat: lat, location_lng: lng })}
                placeholder="City, Country"
                minimal
              />
            </div>
          </div>
        </div>

        <button 
          disabled={loading}
          type="submit"
          className="w-full bg-gold hover:bg-gold/80 text-deep-blue font-bold py-5 rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-xl shadow-gold/20"
        >
          {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
          {loading ? 'Consulting the Cosmos...' : 'Interpret & Save Dream'}
        </button>
      </form>
    </div>
  );
}

function AstralCalendar({ 
  dreams, 
  events, 
  onSelect 
}: { 
  dreams: Dream[], 
  events: any[], 
  onSelect: (d: Dream) => void 
}) {
  const now = new Date();
  const currentMonth = format(now, 'MMMM yyyy');

  // Group dreams by date
  const dreamsByDate = dreams.reduce((acc: any, dream) => {
    const date = format(new Date(dream.date), 'yyyy-MM-dd');
    if (!acc[date]) acc[date] = [];
    acc[date].push(dream);
    return acc;
  }, {});

  // Sort events by date
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-12">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-serif text-white mb-2">Astral Calendar</h2>
        <p className="text-white/40">Significant celestial events for {currentMonth} and your corresponding dreams.</p>
      </div>

      {sortedEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-gold" />
          <p className="text-white/40 font-serif italic">Mapping the month's celestial journey...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedEvents.map((event, idx) => {
            const eventDreams = dreamsByDate[event.date] || [];
            return (
              <div key={idx} className="relative pl-8 border-l border-white/10 space-y-4">
                {/* Dot */}
                <div className="absolute left-[-5px] top-2 w-2 h-2 rounded-full bg-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]" />
                
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  {/* Event Info */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-gold uppercase tracking-widest">
                        {format(new Date(event.date + 'T12:00:00'), 'EEEE, MMM d')}
                      </span>
                      <span className="h-px flex-1 bg-white/5" />
                    </div>
                    <h3 className="text-xl font-serif text-white">{event.event}</h3>
                    <p className="text-sm text-white/50 leading-relaxed">{event.description}</p>
                  </div>

                  {/* Dreams for this date */}
                  <div className="md:w-1/3 space-y-3">
                    {eventDreams.length > 0 ? (
                      <>
                        <h4 className="text-[10px] uppercase tracking-widest text-white/30 font-bold flex items-center gap-2">
                          <Moon className="w-3 h-3" />
                          Dreams on this date
                        </h4>
                        <div className="space-y-2">
                          {eventDreams.map((dream: Dream) => (
                            <motion.div
                              key={dream.id}
                              whileHover={{ x: 5 }}
                              onClick={() => onSelect(dream)}
                              className="glass p-3 rounded-xl cursor-pointer group"
                            >
                              <h5 className="text-sm font-serif text-white group-hover:text-gold transition-colors line-clamp-1">
                                {dream.title}
                              </h5>
                              <p className="text-[10px] text-white/30 line-clamp-1">{dream.content}</p>
                            </motion.div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="p-4 rounded-xl border border-dashed border-white/5 flex items-center justify-center">
                        <p className="text-[10px] text-white/20 italic">No dreams recorded</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FeedView({ 
  dreams, 
  currentAstrology, 
  onSelect 
}: { 
  dreams: Dream[], 
  currentAstrology: any, 
  onSelect: (d: Dream) => void 
}) {
  if (!currentAstrology) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
        <p className="text-white/40 font-serif italic">Consulting the current celestial alignment...</p>
      </div>
    );
  }

  const now = new Date();
  const todayMonthDay = format(now, 'MM-dd');

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
  const yesterdayDream = dreams.find(d => format(new Date(d.date), 'yyyy-MM-dd') === yesterdayStr);

  const anniversaryDreams = dreams.filter(d => {
    const dDate = new Date(d.date);
    return format(dDate, 'MM-dd') === todayMonthDay && format(dDate, 'yyyy') !== format(now, 'yyyy');
  });

  const moonSyncDreams = dreams.filter(d => 
    d.moon_phase?.toLowerCase() === currentAstrology.moon_phase?.toLowerCase()
  ).filter(d => !anniversaryDreams.includes(d) && d.id !== yesterdayDream?.id);

  const sunSyncDreams = dreams.filter(d => 
    d.sun_sign?.toLowerCase() === currentAstrology.sun_sign?.toLowerCase()
  ).filter(d => !anniversaryDreams.includes(d) && !moonSyncDreams.includes(d) && d.id !== yesterdayDream?.id);

  const otherSyncDreams = dreams.filter(d => {
    const planets = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    return planets.some(p => {
      const dreamSign = (d as any)[`${p}_sign`];
      const currentSign = currentAstrology[`${p}_sign`];
      return dreamSign && currentSign && dreamSign.toLowerCase() === currentSign.toLowerCase();
    });
  }).filter(d => !anniversaryDreams.includes(d) && !moonSyncDreams.includes(d) && !sunSyncDreams.includes(d) && d.id !== yesterdayDream?.id);

  const sections = [
    { title: "On This Day...", dreams: anniversaryDreams, icon: <Calendar className="w-4 h-4" /> },
    { title: `Moon in ${currentAstrology.moon_phase}`, dreams: moonSyncDreams, icon: <Moon className="w-4 h-4" /> },
    { title: `Sun in ${currentAstrology.sun_sign}`, dreams: sunSyncDreams, icon: <Sparkles className="w-4 h-4" /> },
    { title: "Planetary Alignments", dreams: otherSyncDreams, icon: <Activity className="w-4 h-4" /> },
  ].filter(s => s.dreams.length > 0);

  if (sections.length === 0 && !yesterdayDream) {
    return (
      <div className="text-center py-20 space-y-4">
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10">
          <Activity className="w-8 h-8 text-white/20" />
        </div>
        <h3 className="text-xl font-serif text-white/60">The stars are quiet today.</h3>
        <p className="text-white/30 text-sm max-w-xs mx-auto">No past dreams match today's celestial signature. Record a new dream to build your cosmic history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-serif text-white mb-2">Cosmic Echoes</h2>
        <p className="text-white/40">Dreams from the past that resonate with today's alignment.</p>
      </div>

      {/* Yesterday's Dream Reminder */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
          <div className="p-2 bg-gold/10 rounded-lg text-gold">
            <Clock className="w-4 h-4" />
          </div>
          <h3 className="text-xs uppercase tracking-[0.3em] text-white/50 font-bold">Yesterday's Reflection</h3>
        </div>

        {yesterdayDream ? (
          <motion.div 
            whileHover={{ y: -5 }}
            onClick={() => onSelect(yesterdayDream)}
            className="glass rounded-3xl overflow-hidden cursor-pointer group border border-gold/20"
          >
            <div className="flex flex-col md:flex-row">
              {yesterdayDream.image_url && (
                <div className="md:w-1/3 h-48 md:h-auto overflow-hidden">
                  <img 
                    src={yesterdayDream.image_url} 
                    alt={yesterdayDream.title} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              <div className="p-8 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-[10px] font-mono text-gold uppercase tracking-widest mb-1 block">Previous Night's Journey</span>
                    <h3 className="text-2xl font-serif text-white group-hover:text-gold transition-colors">{yesterdayDream.title}</h3>
                  </div>
                  <span className="text-[10px] font-mono text-white/20 uppercase">
                    {format(new Date(yesterdayDream.date), 'MMM d, yyyy')}
                  </span>
                </div>
                <p className="text-white/50 text-sm line-clamp-3 leading-relaxed mb-6">
                  {yesterdayDream.content}
                </p>
                <div className="flex items-center gap-2 text-gold text-xs font-bold uppercase tracking-widest">
                  <span>Read Full Interpretation</span>
                  <ChevronLeft className="w-4 h-4 rotate-180" />
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="glass p-8 rounded-3xl border border-dashed border-white/5 text-center">
            <p className="text-white/30 text-sm italic">No dream was recorded yesterday. The stars wait for your next entry.</p>
          </div>
        )}
      </div>

      {sections.map((section, idx) => (
        <div key={idx} className="space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <div className="p-2 bg-gold/10 rounded-lg text-gold">
              {section.icon}
            </div>
            <h3 className="text-xs uppercase tracking-[0.3em] text-white/50 font-bold">{section.title}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {section.dreams.map(dream => (
              <motion.div 
                key={dream.id}
                whileHover={{ y: -5 }}
                onClick={() => onSelect(dream)}
                className="glass rounded-3xl overflow-hidden cursor-pointer group"
              >
                {dream.image_url && (
                  <div className="h-40 overflow-hidden">
                    <img 
                      src={dream.image_url} 
                      alt={dream.title} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-100"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                <div className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-serif text-white group-hover:text-gold transition-colors">{dream.title}</h3>
                    <span className="text-[10px] font-mono text-white/20 uppercase">
                      {format(new Date(dream.date), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <p className="text-white/40 text-xs line-clamp-2 leading-relaxed">
                    {dream.content}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Library({ dreams, onSelect }: { dreams: Dream[], onSelect: (d: Dream) => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [filter, setFilter] = useState({
    planet: 'All',
    sign: 'All',
    moonPhase: 'All',
    dayNumber: 'All'
  });

  const planets = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
  const signs = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
  ];
  const moonPhases = [
    'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 
    'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'
  ];
  const dayNumbers = Array.from({ length: 9 }, (_, i) => (i + 1).toString());

  // Get all unique tags
  const allTags = Array.from(new Set(dreams.flatMap(d => d.tags || []))).sort();

  const filteredDreams = dreams.filter(dream => {
    const searchMatch = 
      dream.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      dream.content.toLowerCase().includes(searchTerm.toLowerCase());
    
    const tagMatch = selectedTag === 'All' || dream.tags?.includes(selectedTag);

    const planetMatch = filter.planet === 'All' || filter.sign === 'All' || (
      (filter.planet === 'Sun' && dream.sun_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Moon' && dream.moon_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Mercury' && dream.mercury_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Venus' && dream.venus_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Mars' && dream.mars_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Jupiter' && dream.jupiter_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Saturn' && dream.saturn_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Uranus' && dream.uranus_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Neptune' && dream.neptune_sign?.toLowerCase().includes(filter.sign.toLowerCase()))
    );

    const moonMatch = filter.moonPhase === 'All' || dream.moon_phase?.toLowerCase().includes(filter.moonPhase.toLowerCase());
    const dayMatch = filter.dayNumber === 'All' || dream.day_number?.toString() === filter.dayNumber;

    return searchMatch && tagMatch && planetMatch && moonMatch && dayMatch;
  });

  return (
    <div className="space-y-8">
      {/* Search and Filters */}
      <div className="glass p-6 rounded-3xl space-y-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
          <input 
            type="text"
            placeholder="Search dreams by keywords..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-gold/50 transition-all"
          />
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-white/30 ml-1">Planetary Sign</label>
            <div className="flex gap-2">
              <select 
                value={filter.planet}
                onChange={e => setFilter({ ...filter, planet: e.target.value })}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
              >
                <option value="All">Any Planet</option>
                {planets.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select 
                value={filter.sign}
                onChange={e => setFilter({ ...filter, sign: e.target.value })}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
              >
                <option value="All">Any Sign</option>
                {signs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-white/30 ml-1">Moon Phase</label>
            <select 
              value={filter.moonPhase}
              onChange={e => setFilter({ ...filter, moonPhase: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="All">Any Phase</option>
              {moonPhases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-white/30 ml-1">Day Number</label>
            <select 
              value={filter.dayNumber}
              onChange={e => setFilter({ ...filter, dayNumber: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="All">Any Number</option>
              {dayNumbers.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <button 
            onClick={() => {
              setFilter({ planet: 'All', sign: 'All', moonPhase: 'All', dayNumber: 'All' });
              setSearchTerm('');
              setSelectedTag('All');
            }}
            className="text-xs text-gold hover:text-gold/80 transition-colors mb-2 ml-auto"
          >
            Reset All
          </button>
        </div>

        {allTags.length > 0 && (
          <div className="pt-4 border-t border-white/5">
            <label className="text-[10px] uppercase tracking-widest text-white/30 ml-1 mb-2 block">Filter by Symbols</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedTag('All')}
                className={cn(
                  "text-[10px] px-3 py-1 rounded-full border transition-all uppercase tracking-tighter",
                  selectedTag === 'All' ? "bg-gold/20 border-gold text-gold" : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
                )}
              >
                All Symbols
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={cn(
                    "text-[10px] px-3 py-1 rounded-full border transition-all uppercase tracking-tighter",
                    selectedTag === tag ? "bg-gold/20 border-gold text-gold" : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {filteredDreams.length === 0 ? (
        <div className="text-center py-20">
          <Moon className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <p className="text-white/30">No dreams match your cosmic filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredDreams.map((dream) => (
            <motion.div 
              key={dream.id}
              whileHover={{ y: -5 }}
              onClick={() => onSelect(dream)}
              className="glass rounded-3xl overflow-hidden cursor-pointer group"
            >
              {dream.image_url && (
                <div className="h-48 overflow-hidden">
                  <img 
                    src={dream.image_url} 
                    alt={dream.title} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              <div className="p-6">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xl font-serif text-white group-hover:text-gold transition-colors">{dream.title}</h3>
                  <span className="text-[10px] font-mono text-white/20 uppercase tracking-tighter">
                    {format(new Date(dream.date), 'MMM d, yyyy')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {dream.sun_sign && <span className="text-[9px] bg-gold/10 border border-gold/20 px-2 py-0.5 rounded-full text-gold uppercase tracking-tighter">Sun in {dream.sun_sign}</span>}
                  {dream.moon_phase && <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full text-white/40 uppercase tracking-tighter">{dream.moon_phase}</span>}
                </div>
                <p className="text-white/40 text-sm line-clamp-2 leading-relaxed mb-4">
                  {dream.content}
                </p>
                {dream.tags && dream.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {dream.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[8px] text-white/20 uppercase tracking-widest border border-white/5 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                    {dream.tags.length > 3 && <span className="text-[8px] text-white/20 uppercase tracking-widest px-1.5 py-0.5">+{dream.tags.length - 3}</span>}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function DreamDetail({ dream, onBack, onDelete, onUpdate }: { dream: Dream, onBack: () => void, onDelete: () => void, onUpdate: (d: Dream) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(dream);
  const [selectedInfluence, setSelectedInfluence] = useState<{ planet: string, text: string } | null>(null);
  const [newTag, setNewTag] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    setEditData(dream);
  }, [dream]);

  const handleSave = () => {
    onUpdate(editData);
    setIsEditing(false);
  };

  const addTag = () => {
    if (newTag.trim() && !editData.tags?.includes(newTag.trim())) {
      const updatedTags = [...(editData.tags || []), newTag.trim()];
      setEditData({ ...editData, tags: updatedTags });
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    const updatedTags = editData.tags?.filter(t => t !== tagToRemove) || [];
    setEditData({ ...editData, tags: updatedTags });
  };

  const planetarySymbols: Record<string, string> = {
    sun: '☉',
    moon: '☽',
    mercury: '☿',
    venus: '♀',
    mars: '♂',
    jupiter: '♃',
    saturn: '♄',
    uranus: '♅',
    neptune: '♆',
    pluto: '♇'
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8 pb-12"
    >
      <div className="flex justify-between items-center">
        <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back to Library</span>
        </button>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsEditing(!isEditing)} 
            className="p-2 text-white/20 hover:text-white transition-colors"
          >
            {isEditing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={onDelete} className="p-2 text-white/20 hover:text-red-500 transition-colors">
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {dream.image_url && !isEditing && (
          <div className="rounded-3xl overflow-hidden shadow-2xl border border-white/5">
            <img 
              src={dream.image_url} 
              alt={dream.title} 
              className="w-full aspect-video object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        {isEditing ? (
          <div className="glass p-8 rounded-3xl space-y-6">
            <input 
              type="text"
              value={editData.title}
              onChange={e => setEditData({ ...editData, title: e.target.value })}
              className="w-full bg-transparent border-b border-white/10 text-3xl font-serif text-white focus:outline-none focus:border-orange-500/50 py-2"
            />
            <textarea 
              rows={5}
              value={editData.content}
              onChange={e => setEditData({ ...editData, content: e.target.value })}
              className="w-full bg-transparent text-white/80 focus:outline-none resize-none"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input 
                type="date"
                value={editData.date}
                onChange={e => setEditData({ ...editData, date: e.target.value })}
                className="bg-white/5 p-3 rounded-xl text-white focus:outline-none"
              />
              <input 
                type="time"
                value={editData.time}
                onChange={e => setEditData({ ...editData, time: e.target.value })}
                className="bg-white/5 p-3 rounded-xl text-white focus:outline-none"
              />
              <LocationPicker 
                value={editData.location_name}
                onChange={(name, lat, lng) => setEditData({ ...editData, location_name: name, location_lat: lat, location_lng: lng })}
                placeholder="Location"
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-widest text-white/30 ml-1">Personal Notes</label>
              <textarea 
                rows={4}
                value={editData.notes || ''}
                onChange={e => setEditData({ ...editData, notes: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors text-sm"
                placeholder="Your ideas, notes, or creative writing..."
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-widest text-white/30 ml-1">Symbols & Tags</label>
              <div className="flex flex-wrap gap-2">
                {editData.tags?.map(tag => (
                  <span key={tag} className="flex items-center gap-1 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs text-white/70">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="text-white/20 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-2">
                  <input 
                    type="text"
                    value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTag()}
                    placeholder="Add symbol..."
                    className="bg-transparent border-b border-white/10 text-xs text-white focus:outline-none py-1 w-24"
                  />
                  <button onClick={addTag} className="text-gold hover:text-gold/80">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <button 
              onClick={handleSave}
              className="w-full bg-gold text-deep-blue py-3 rounded-xl font-bold"
            >
              Save Changes
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h2 className="text-5xl font-serif text-white">{dream.title}</h2>
              <div className="flex flex-wrap gap-4 text-xs font-mono text-white/30 uppercase tracking-widest">
                <span>{format(new Date(dream.date), 'MMMM d, yyyy')}</span>
                <span>•</span>
                <span>{dream.time}</span>
                <span>•</span>
                <span>{dream.location_name}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Tag 
                label="Sun" 
                value={dream.sun_sign} 
                symbol={planetarySymbols.sun}
                onClick={() => setSelectedInfluence({ planet: 'Sun', text: dream.planetary_influences?.sun || 'No specific influence recorded.' })}
              />
              <Tag 
                label="Moon" 
                value={dream.moon_sign} 
                symbol={planetarySymbols.moon}
                onClick={() => setSelectedInfluence({ planet: 'Moon', text: dream.planetary_influences?.moon || 'No specific influence recorded.' })}
              />
              <Tag 
                label="Mercury" 
                value={dream.mercury_sign} 
                symbol={planetarySymbols.mercury}
                onClick={() => setSelectedInfluence({ planet: 'Mercury', text: dream.planetary_influences?.mercury || 'No specific influence recorded.' })}
              />
              <Tag 
                label="Venus" 
                value={dream.venus_sign} 
                symbol={planetarySymbols.venus}
                onClick={() => setSelectedInfluence({ planet: 'Venus', text: dream.planetary_influences?.venus || 'No specific influence recorded.' })}
              />
              <Tag 
                label="Mars" 
                value={dream.mars_sign} 
                symbol={planetarySymbols.mars}
                onClick={() => setSelectedInfluence({ planet: 'Mars', text: dream.planetary_influences?.mars || 'No specific influence recorded.' })}
              />
              <Tag 
                label="Jupiter" 
                value={dream.jupiter_sign} 
                symbol={planetarySymbols.jupiter}
                onClick={() => setSelectedInfluence({ planet: 'Jupiter', text: dream.planetary_influences?.jupiter || 'No specific influence recorded.' })}
              />
              <Tag 
                label="Saturn" 
                value={dream.saturn_sign} 
                symbol={planetarySymbols.saturn}
                onClick={() => setSelectedInfluence({ planet: 'Saturn', text: dream.planetary_influences?.saturn || 'No specific influence recorded.' })}
              />
              <Tag 
                label="Uranus" 
                value={dream.uranus_sign} 
                symbol={planetarySymbols.uranus}
                onClick={() => setSelectedInfluence({ planet: 'Uranus', text: dream.planetary_influences?.uranus || 'No specific influence recorded.' })}
              />
              <Tag 
                label="Neptune" 
                value={dream.neptune_sign} 
                symbol={planetarySymbols.neptune}
                onClick={() => setSelectedInfluence({ planet: 'Neptune', text: dream.planetary_influences?.neptune || 'No specific influence recorded.' })}
              />
              <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-2">
                <span className="text-[8px] uppercase tracking-widest text-white/30 font-bold">Phase</span>
                <span className="text-xs text-white/80 font-medium">{dream.moon_phase}</span>
              </div>
              <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-2">
                <span className="text-[8px] uppercase tracking-widest text-white/30 font-bold">Day</span>
                <span className="text-xs text-white/80 font-medium">{dream.day_number}</span>
              </div>
            </div>

            {dream.tags && dream.tags.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] uppercase tracking-widest text-white/30 font-bold flex items-center gap-2">
                  <TagIcon className="w-3 h-3" />
                  Symbols Detected
                </h4>
                <div className="flex flex-wrap gap-2">
                  {dream.tags.map(tag => (
                    <span key={tag} className="bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs text-white/60 uppercase tracking-tighter">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence>
              {selectedInfluence && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="glass p-6 rounded-2xl border-orange-500/20 relative"
                >
                  <button 
                    onClick={() => setSelectedInfluence(null)}
                    className="absolute top-4 right-4 text-white/20 hover:text-white"
                  >
                    ×
                  </button>
                  <h4 className="text-xs uppercase tracking-[0.2em] text-gold font-semibold mb-2">
                    {selectedInfluence.planet} Influence
                  </h4>
                  <p className="text-sm text-white/70 leading-relaxed">
                    {selectedInfluence.text}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="glass p-8 rounded-3xl">
              <h3 className="text-xs uppercase tracking-[0.2em] text-gold font-semibold mb-4">The Dream</h3>
              <p className="text-lg text-white/80 leading-relaxed italic">"{dream.content}"</p>
            </div>

            <div className="glass p-8 rounded-3xl markdown-body">
              <div className="flex items-center gap-2 mb-6">
                <Sparkles className="w-5 h-5 text-gold" />
                <h3 className="text-xs uppercase tracking-[0.2em] text-gold font-semibold m-0">Celestial Interpretation</h3>
              </div>
              <ReactMarkdown>{dream.interpretation || ''}</ReactMarkdown>
            </div>

            <div className="glass p-8 rounded-3xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Book className="w-5 h-5 text-gold" />
                  <h3 className="text-xs uppercase tracking-[0.2em] text-gold font-semibold m-0">Personal Notes</h3>
                </div>
                {editData.notes !== dream.notes && (
                  <button 
                    onClick={async () => {
                      setIsSavingNote(true);
                      await onUpdate(editData);
                      setIsSavingNote(false);
                    }}
                    disabled={isSavingNote}
                    className="text-[10px] text-gold hover:text-gold/80 transition-colors uppercase tracking-widest font-bold flex items-center gap-1"
                  >
                    {isSavingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Save Notes
                  </button>
                )}
              </div>
              <textarea
                value={editData.notes || ''}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                placeholder="Type your own ideas, notes, or creative writing from the future into your dream..."
                className="w-full bg-transparent text-white/70 text-sm leading-relaxed focus:outline-none min-h-[150px] resize-none placeholder:text-white/10"
              />
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function ProfileView({ profile, onEdit }: { profile: UserProfile, onEdit: () => void }) {
  const planetarySymbols: Record<string, string> = {
    sun: '☉',
    moon: '☽',
    mercury: '☿',
    venus: '♀',
    mars: '♂',
    jupiter: '♃',
    saturn: '♄',
    uranus: '♅',
    neptune: '♆',
    pluto: '♇',
    rising: 'ASC'
  };

  return (
    <div className="space-y-12">
      <div className="text-center mb-12">
        <div className="w-24 h-24 bg-gold/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-gold/20 relative">
          <User className="w-10 h-10 text-gold" />
          {profile.life_path && (
            <div className="absolute -bottom-2 -right-2 bg-gold text-deep-blue w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-lg">
              {profile.life_path}
            </div>
          )}
        </div>
        <h2 className="text-4xl font-serif text-white mb-2">{profile.name}</h2>
        <p className="text-white/40 uppercase tracking-[0.2em] text-[10px] font-bold">
          Life Path {profile.life_path} • {profile.chinese_zodiac}
        </p>
      </div>

      <div className="space-y-8">
        <div className="glass p-8 rounded-[40px] border-white/5">
          <h3 className="text-xs uppercase tracking-[0.2em] text-gold font-semibold mb-8 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Your Birth Chart
          </h3>
          <div className="flex flex-wrap gap-4 justify-center">
            <Tag label="Sun" value={profile.sun_sign} symbol={planetarySymbols.sun} />
            <Tag label="Moon" value={profile.moon_sign} symbol={planetarySymbols.moon} />
            <Tag label="Rising" value={profile.rising_sign} symbol={planetarySymbols.rising} />
            <Tag label="Mercury" value={profile.mercury_sign} symbol={planetarySymbols.mercury} />
            <Tag label="Venus" value={profile.venus_sign} symbol={planetarySymbols.venus} />
            <Tag label="Mars" value={profile.mars_sign} symbol={planetarySymbols.mars} />
            <Tag label="Jupiter" value={profile.jupiter_sign} symbol={planetarySymbols.jupiter} />
            <Tag label="Saturn" value={profile.saturn_sign} symbol={planetarySymbols.saturn} />
            <Tag label="Uranus" value={profile.uranus_sign} symbol={planetarySymbols.uranus} />
            <Tag label="Neptune" value={profile.neptune_sign} symbol={planetarySymbols.neptune} />
            <Tag label="Pluto" value={profile.pluto_sign} symbol={planetarySymbols.pluto} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="glass p-8 rounded-[40px] border-white/5">
            <h3 className="text-xs uppercase tracking-[0.2em] text-gold font-semibold mb-6">Incarnation Details</h3>
            <div className="space-y-4">
              <DetailRow label="Date of Arrival" value={format(new Date(profile.dob), 'MMMM d, yyyy')} />
              <DetailRow label="Moment of Birth" value={profile.tob} />
              <DetailRow label="Earthly Origin" value={profile.lob_name} />
              <DetailRow label="Chinese Zodiac" value={profile.chinese_zodiac || ''} />
              <DetailRow label="Life Path Number" value={String(profile.life_path || '')} />
            </div>
            <button 
              onClick={onEdit}
              className="w-full mt-8 py-4 rounded-2xl border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition-all text-sm font-medium"
            >
              Re-align Profile
            </button>
          </div>

          <div className="glass p-8 rounded-[40px] border-white/5 markdown-body">
            <h3 className="text-xs uppercase tracking-[0.2em] text-gold font-semibold mb-6">Soul Blueprint</h3>
            <ReactMarkdown>{profile.birth_chart_interpretation || ''}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-white/5">
      <span className="text-xs uppercase tracking-widest text-white/30">{label}</span>
      <span className="text-sm text-white/80">{value}</span>
    </div>
  );
}

function Tag({ 
  label, 
  value, 
  symbol, 
  influence, 
  onClick 
}: { 
  label: string, 
  value?: string, 
  symbol?: string, 
  influence?: string, 
  onClick?: () => void 
}) {
  if (!value) return null;
  return (
    <motion.button 
      whileHover={{ scale: 1.05, backgroundColor: 'rgba(212, 175, 55, 0.15)' }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-2 transition-colors hover:border-gold/30 group"
    >
      <span className="text-gold font-serif text-lg leading-none group-hover:text-gold/80">{symbol}</span>
      <div className="flex flex-col items-start leading-tight">
        <span className="text-[8px] uppercase tracking-widest text-white/30 font-bold">{label}</span>
        <span className="text-xs text-white/80 font-medium">{value}</span>
      </div>
    </motion.button>
  );
}

function InsightsView({ dreams, insights, setInsights }: { dreams: Dream[], insights: string[], setInsights: (i: string[]) => void }) {
  const [loading, setLoading] = useState(false);

  const handleGenerateInsights = async () => {
    if (dreams.length < 3) {
      alert("Record at least 3 dreams to begin pattern detection.");
      return;
    }
    setLoading(true);
    try {
      const newInsights = await generateInsights(dreams);
      setInsights(newInsights);
    } catch (error) {
      console.error('Failed to generate insights:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-serif text-white mb-2">Cosmic Insights</h2>
        <p className="text-white/40">Pattern detection through your dream history and astrological alignments.</p>
      </div>

      {insights.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {insights.map((insight, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="glass p-8 rounded-3xl border-gold/20 flex items-start gap-6"
            >
              <div className="p-3 bg-gold/10 rounded-2xl text-gold shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="text-xl font-serif text-white/90 leading-relaxed pt-1">
                {insight}
              </p>
            </motion.div>
          ))}
          
          <button 
            onClick={handleGenerateInsights}
            disabled={loading}
            className="mt-8 py-4 px-8 rounded-2xl border border-gold/20 text-gold hover:bg-gold/5 transition-all flex items-center justify-center gap-3 mx-auto"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5" />}
            {loading ? 'Analyzing Patterns...' : 'Refresh Insights'}
          </button>
        </div>
      ) : (
        <div className="glass p-12 rounded-[40px] text-center space-y-8 border-white/5">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10">
            <BarChart3 className="w-10 h-10 text-white/20" />
          </div>
          <div className="space-y-4">
            <h3 className="text-2xl font-serif text-white/60">Unlock Your Patterns</h3>
            <p className="text-white/30 max-w-md mx-auto leading-relaxed">
              As you record more dreams, the AI will begin to detect correlations between your subconscious symbols and the movement of the stars.
            </p>
          </div>
          <button 
            onClick={handleGenerateInsights}
            disabled={loading || dreams.length < 3}
            className="bg-gold text-deep-blue font-bold px-10 py-4 rounded-2xl shadow-xl shadow-gold/20 hover:scale-105 transition-all disabled:opacity-30 disabled:hover:scale-100"
          >
            {loading ? 'Analyzing...' : 'Generate Insights'}
          </button>
          {dreams.length < 3 && (
            <p className="text-[10px] uppercase tracking-widest text-white/20">
              Need {3 - dreams.length} more dreams to begin analysis
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LocationPicker({ 
  value, 
  onChange, 
  placeholder = "Search city...",
  minimal = false
}: { 
  value: string, 
  onChange: (name: string, lat: number, lng: number) => void,
  placeholder?: string,
  minimal?: boolean
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length > 2 && showDropdown) {
        setSearching(true);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
          const data = await res.json();
          setResults(data);
        } catch (e) {
          console.error(e);
        } finally {
          setSearching(false);
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query, showDropdown]);

  return (
    <div ref={containerRef} className="relative w-full">
      <input 
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        className={cn(
          "w-full focus:outline-none transition-colors",
          minimal 
            ? "bg-transparent text-sm text-white/60" 
            : "bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-orange-500/50"
        )}
        placeholder={placeholder}
      />
      {showDropdown && (query.length > 2 || searching) && (
        <div className="absolute bottom-full left-0 w-full mb-2 glass rounded-xl overflow-hidden z-[100] shadow-2xl border border-white/10 max-h-60 overflow-y-auto">
          {searching ? (
            <div className="p-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-orange-500" /></div>
          ) : results.length > 0 ? (
            results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setQuery(r.display_name);
                  onChange(r.display_name, parseFloat(r.lat), parseFloat(r.lon));
                  setShowDropdown(false);
                }}
                className="w-full text-left px-4 py-3 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5 last:border-0"
              >
                {r.display_name}
              </button>
            ))
          ) : query.length > 2 && (
            <div className="p-4 text-xs text-white/30 text-center">No locations found</div>
          )}
        </div>
      )}
    </div>
  );
}
