import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Moon, Book, User, Plus, Sparkles, Loader2, Trash2, ChevronLeft, Calendar, MapPin, Clock } from 'lucide-react';
import { UserProfile, Dream } from './types';
import { generateProfileAnalysis, interpretDream, generateDreamImage } from './services/geminiService';
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
  const [activeTab, setActiveTab] = useState<'journal' | 'library' | 'profile'>('journal');
  const [loading, setLoading] = useState(true);
  const [selectedDream, setSelectedDream] = useState<Dream | null>(null);

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
        moon_phase: aiResponse.moon_phase,
        day_number: aiResponse.day_number,
        image_url: imageUrl || undefined 
      };
      
      const res = await fetch('/api/dreams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dreamWithAi)
      });
      
      const { id } = await res.json();
      const savedDream = { ...dreamWithAi, id };
      
      setDreams([savedDream, ...dreams]);
      setSelectedDream(savedDream);
      setActiveTab('library');
    } catch (error) {
      console.error('Failed to save dream:', error);
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
              {activeTab === 'library' && <Library dreams={dreams} onSelect={setSelectedDream} />}
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
            active={activeTab === 'library'} 
            onClick={() => setActiveTab('library')}
            icon={<Book className="w-5 h-5" />}
            label="Library"
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
        active ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-white/40 hover:text-white/60"
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
          <Moon className="w-12 h-12 text-orange-500 mx-auto mb-4" />
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
            <input 
              required
              type="text"
              value={formData.lob_name}
              onChange={e => setFormData({ ...formData, lob_name: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors"
              placeholder="City, Country"
            />
          </div>
          
          <button 
            disabled={loading}
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-4 rounded-xl mt-4 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
    location_name: 'Current Location'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
              <input 
                type="text"
                value={formData.location_name}
                onChange={e => setFormData({ ...formData, location_name: e.target.value })}
                className="bg-transparent text-sm focus:outline-none text-white/60 w-full"
                placeholder="Location"
              />
            </div>
          </div>
        </div>

        <button 
          disabled={loading}
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-5 rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-xl shadow-orange-500/20"
        >
          {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
          {loading ? 'Consulting the Cosmos...' : 'Interpret & Save Dream'}
        </button>
      </form>
    </div>
  );
}

function Library({ dreams, onSelect }: { dreams: Dream[], onSelect: (d: Dream) => void }) {
  const [filter, setFilter] = useState({
    planet: 'All',
    sign: 'All',
    moonPhase: 'All',
    dayNumber: 'All'
  });

  const planets = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  const signs = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
  ];
  const moonPhases = [
    'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 
    'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'
  ];
  const dayNumbers = Array.from({ length: 9 }, (_, i) => (i + 1).toString());

  const filteredDreams = dreams.filter(dream => {
    const planetMatch = filter.planet === 'All' || filter.sign === 'All' || (
      (filter.planet === 'Sun' && dream.sun_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Moon' && dream.moon_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Mercury' && dream.mercury_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Venus' && dream.venus_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Mars' && dream.mars_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Jupiter' && dream.jupiter_sign?.toLowerCase().includes(filter.sign.toLowerCase())) ||
      (filter.planet === 'Saturn' && dream.saturn_sign?.toLowerCase().includes(filter.sign.toLowerCase()))
    );

    const moonMatch = filter.moonPhase === 'All' || dream.moon_phase?.toLowerCase().includes(filter.moonPhase.toLowerCase());
    const dayMatch = filter.dayNumber === 'All' || dream.day_number?.toString() === filter.dayNumber;

    return planetMatch && moonMatch && dayMatch;
  });

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="glass p-6 rounded-3xl flex flex-wrap gap-4 items-end">
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
          onClick={() => setFilter({ planet: 'All', sign: 'All', moonPhase: 'All', dayNumber: 'All' })}
          className="text-xs text-orange-500 hover:text-orange-400 transition-colors mb-2 ml-auto"
        >
          Reset Filters
        </button>
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
                  <h3 className="text-xl font-serif text-white group-hover:text-orange-400 transition-colors">{dream.title}</h3>
                  <span className="text-[10px] font-mono text-white/20 uppercase tracking-tighter">
                    {format(new Date(dream.date), 'MMM d, yyyy')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {dream.sun_sign && <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full text-white/40 uppercase tracking-tighter">Sun in {dream.sun_sign}</span>}
                  {dream.moon_phase && <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded-full text-white/40 uppercase tracking-tighter">{dream.moon_phase}</span>}
                </div>
                <p className="text-white/40 text-sm line-clamp-2 leading-relaxed">
                  {dream.content}
                </p>
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

  const handleSave = () => {
    onUpdate(editData);
    setIsEditing(false);
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
          <div className="rounded-3xl overflow-hidden shadow-2xl">
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
            <div className="grid grid-cols-2 gap-4">
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
            </div>
            <button 
              onClick={handleSave}
              className="w-full bg-orange-500 text-white py-3 rounded-xl font-medium"
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
              <Tag label="Sun" value={dream.sun_sign} />
              <Tag label="Moon" value={dream.moon_sign} />
              <Tag label="Venus" value={dream.venus_sign} />
              <Tag label="Mars" value={dream.mars_sign} />
              <Tag label="Phase" value={dream.moon_phase} />
              <Tag label="Day" value={dream.day_number?.toString()} />
            </div>

            <div className="glass p-8 rounded-3xl">
              <h3 className="text-xs uppercase tracking-[0.2em] text-orange-500 font-semibold mb-4">The Dream</h3>
              <p className="text-lg text-white/80 leading-relaxed italic">"{dream.content}"</p>
            </div>

            <div className="glass p-8 rounded-3xl markdown-body">
              <div className="flex items-center gap-2 mb-6">
                <Sparkles className="w-5 h-5 text-orange-500" />
                <h3 className="text-xs uppercase tracking-[0.2em] text-orange-500 font-semibold m-0">Celestial Interpretation</h3>
              </div>
              <ReactMarkdown>{dream.interpretation || ''}</ReactMarkdown>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function ProfileView({ profile, onEdit }: { profile: UserProfile, onEdit: () => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center mb-12">
        <div className="w-24 h-24 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-orange-500/20">
          <User className="w-10 h-10 text-orange-500" />
        </div>
        <h2 className="text-4xl font-serif text-white mb-2">{profile.name}</h2>
        <p className="text-white/40">Born under the {profile.chinese_zodiac} • Life Path {profile.life_path}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass p-8 rounded-3xl">
          <h3 className="text-xs uppercase tracking-[0.2em] text-orange-500 font-semibold mb-6">Birth Details</h3>
          <div className="space-y-4">
            <DetailRow label="Date" value={format(new Date(profile.dob), 'MMMM d, yyyy')} />
            <DetailRow label="Time" value={profile.tob} />
            <DetailRow label="Location" value={profile.lob_name} />
          </div>
          <button 
            onClick={onEdit}
            className="w-full mt-8 py-3 rounded-xl border border-white/10 text-white/40 hover:text-white hover:border-white/20 transition-all text-sm"
          >
            Edit Profile
          </button>
        </div>

        <div className="glass p-8 rounded-3xl markdown-body">
          <h3 className="text-xs uppercase tracking-[0.2em] text-orange-500 font-semibold mb-6">Natal Analysis</h3>
          <ReactMarkdown>{profile.birth_chart_interpretation || ''}</ReactMarkdown>
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

function Tag({ label, value }: { label: string, value?: string }) {
  if (!value) return null;
  return (
    <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-2">
      <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold">{label}</span>
      <span className="text-xs text-white/80 font-medium">{value}</span>
    </div>
  );
}
