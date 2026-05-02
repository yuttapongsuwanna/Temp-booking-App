'use client'; // Required for Next.js App Router

import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Calendar as CalendarIcon, Clock, Users, CheckCircle, AlertCircle, Sparkles, User as UserIcon, ShieldAlert, ChevronLeft, ChevronRight, Edit2, Save, X, Settings, LogOut, Upload, Repeat } from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyCC7ulkUa_JZLPAZRqV60gbn5gvKIxAQfM",
  authDomain: "na-n-friends-booking-app.firebaseapp.com",
  projectId: "na-n-friends-booking-app",
  storageBucket: "na-n-friends-booking-app.firebasestorage.app",
  messagingSenderId: "536791136057",
  appId: "1:536791136057:web:beb898342be4dc5e42dae8"
};

const ADMIN_EMAIL = "admin@sindhorn.com"; 
const GEMINI_API_KEY = "AIzaSyDvf9GmAB70DGOiSA6Bn3KFVu_C0rIc47I"; 

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function BookingSystem() {
  // --- Auth State ---
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // --- App State ---
  const [classes, setClasses] = useState<any[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  
  // View State (Day / Week / Month / My Bookings)
  const [viewMode, setViewMode] = useState('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modal & Input State
  const [selectedClassId, setSelectedClassId] = useState<any>(null);
  const [aiInput, setAiInput] = useState('');
  const [editingClassId, setEditingClassId] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({ title: '', date: '', time: '' });

  // Admin Advanced Creation State
  const [adminCreationTab, setAdminCreationTab] = useState('recurring');
  const [recurringData, setRecurringData] = useState({ title: '', startDate: '', endDate: '', time: '10:00', days: [] as number[] });
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);

  // System Settings State (In a real app, this should also be in Firestore)
  const [bookingStartHour, setBookingStartHour] = useState(6);
  const [bookingEndHour, setBookingEndHour] = useState(22);   
  
  const currentHour = new Date().getHours(); 
  const isBookingTimeAllowed = currentHour >= bookingStartHour && currentHour < bookingEndHour;

  // ============================================================================
  // AUTHENTICATION & DATA FETCHING
  // ============================================================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser: any) => {
      if (currentUser) {
        setUser(currentUser);
        // Determine role based on email
        const role = currentUser.email === ADMIN_EMAIL ? 'admin' : 'user';
        const name = currentUser.email === ADMIN_EMAIL ? 'Admin' : currentUser.email.split('@')[0];
        
        setCurrentUserProfile({ 
          id: currentUser.uid, 
          email: currentUser.email,
          name: name, 
          role: role 
        });
      } else {
        setUser(null);
        setCurrentUserProfile(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return; // Only fetch data if logged in

    const unsubscribe = onSnapshot(collection(db, 'classes'), (snapshot: any) => {
      const classesData = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      }));
      setClasses(classesData);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
    } catch (error) {
      setLoginError("Invalid email or password. Please try again.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // ============================================================================
  // DATE LOGIC & MEMO HELPERS
  // ============================================================================
  const getStartOfWeek = (date: any) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // Sunday is 0
    return new Date(d.setDate(diff));
  };

  const navigateDate = (direction: number) => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() + direction);
    else if (viewMode === 'week') newDate.setDate(newDate.getDate() + (direction * 7));
    else if (viewMode === 'month') newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const getDisplayDateRange = () => {
    const options: any = { month: 'short', day: 'numeric', year: 'numeric' };
    if (viewMode === 'day') return currentDate.toLocaleDateString('en-US', options);
    if (viewMode === 'week') {
      const start = getStartOfWeek(currentDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', options)}`;
    }
    return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getMonthCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push({ date: new Date(year, month, 0 - (firstDay - i - 1)), isCurrentMonth: false });
    for (let i = 1; i <= daysInMonth; i++) days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    let nextMonthDay = 1;
    while (days.length % 7 !== 0) days.push({ date: new Date(year, month + 1, nextMonthDay++), isCurrentMonth: false });
    return days;
  };

  const getWeekCalendarDays = () => {
    const start = getStartOfWeek(currentDate);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push({ date: d, isCurrentMonth: d.getMonth() === currentDate.getMonth() });
    }
    return days;
  };

  const getClassesForDate = (dateObj: any) => {
    const dateString = dateObj.toLocaleDateString('sv-SE'); 
    return classes.filter(c => c.date === dateString).sort((a, b) => a.time.localeCompare(b.time));
  };

  const filteredClassesDayView = useMemo(() => {
    return classes.filter(c => {
      const classDate = new Date(c.date);
      return classDate.toDateString() === currentDate.toDateString();
    }).sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
  }, [classes, currentDate]);

  const myClasses = useMemo(() => {
    if (!currentUserProfile) return [];
    return classes.filter(c => 
      c.booked?.some((b: any) => b.id === currentUserProfile.id) || 
      c.waitlist?.some((w: any) => w.id === currentUserProfile.id)
    ).sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
  }, [classes, currentUserProfile]);

  const uniqueClassTitles = useMemo(() => {
    const titles = classes.map(c => c.title);
    return Array.from(new Set(titles));
  }, [classes]);

  // ============================================================================
  // DATABASE ACTION FUNCTIONS
  // ============================================================================
  const handleAiCreateClass = async () => {
    if (!aiInput.trim()) return;
    setIsProcessingBulk(true);
    
    try {
      if (!GEMINI_API_KEY || GEMINI_API_KEY === "AIzaSyDvf9GmAB70DGOiSA6Bn3KFVu_C0rIc47I") {
        alert("Fail");
        setIsProcessingBulk(false);
        return;
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `สร้างคลาสจากข้อความนี้: "${aiInput}". ปีปัจจุบันคือ ${new Date().getFullYear()} และวันนี้คือวันที่ ${currentDate.toLocaleDateString('sv-SE')}` }] }],
          systemInstruction: { parts: [{ text: 'Extract class details. Return ONLY a valid JSON object in this format (no markdown tags): {"title": "ชื่อคลาส", "date": "YYYY-MM-DD", "time": "HH:mm"}. ตัวอย่างเวลา 18:00, 08:00' }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) throw new Error("No response from AI");
      const parsedData = JSON.parse(textResponse.trim());

      await addDoc(collection(db, 'classes'), {
        title: parsedData.title || 'คลาสใหม่',
        date: parsedData.date || currentDate.toLocaleDateString('sv-SE'), 
        time: parsedData.time || '10:00',
        booked: [],
        waitlist: [],
        createdAt: serverTimestamp()
      });
      
      alert(`✨ AI สร้างคลาส "${parsedData.title}" เรียบร้อยครับ!`);
      setAiInput('');
    } catch (error) {
      console.error("Error creating class with AI:", error);
      alert("AI ไม่สามารถวิเคราะห์ได้ กรุณาลองใหม่ เช่น 'คลาสโยคะ พรุ่งนี้ 18:00'");
    }
    setIsProcessingBulk(false);
  };

  const handleRecurringCreate = async () => {
    if (!recurringData.title || !recurringData.startDate || !recurringData.endDate || recurringData.days.length === 0) {
      alert("กรุณากรอกข้อมูลให้ครบ และเลือกวันอย่างน้อย 1 วัน");
      return;
    }
    setIsProcessingBulk(true);
    const start = new Date(recurringData.startDate);
    const end = new Date(recurringData.endDate);
    let curr = new Date(start);
    let successCount = 0;

    while (curr <= end) {
      if (recurringData.days.includes(curr.getDay())) {
        await addDoc(collection(db, 'classes'), {
          title: recurringData.title,
          date: curr.toLocaleDateString('sv-SE'), 
          time: recurringData.time,
          booked: [],
          waitlist: [],
          createdAt: serverTimestamp()
        });
        successCount++;
      }
      curr.setDate(curr.getDate() + 1);
    }
    alert(`สร้างคลาสสำเร็จ ${successCount} คลาส`);
    setIsProcessingBulk(false);
    setRecurringData({ ...recurringData, title: '' }); 
  };

  const handleCsvUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessingBulk(true);
    const reader = new FileReader();
    reader.onload = async (event: any) => {
      const csvText = event.target.result;
      const lines = csvText.split('\n');
      let successCount = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (i === 0 && line.toLowerCase().includes('title')) continue; 
        const parts = line.split(',');
        if (parts.length >= 3) {
          const title = parts[0].trim();
          const date = parts[1].trim(); 
          const time = parts[2].trim(); 
          if (title && date && time) {
            await addDoc(collection(db, 'classes'), {
              title, date, time, booked: [], waitlist: [], createdAt: serverTimestamp()
            });
            successCount++;
          }
        }
      }
      alert(`นำเข้าสำเร็จ ${successCount} คลาสจากไฟล์ CSV`);
      setIsProcessingBulk(false);
      e.target.value = ''; 
    };
    reader.readAsText(file);
  };

  const deleteClass = async (classId: string) => {
    if(window.confirm("Are you sure you want to delete this class?")) {
      await deleteDoc(doc(db, 'classes', classId));
      setSelectedClassId(null);
    }
  };

  const startEditing = (classItem: any) => {
    setEditingClassId(classItem.id);
    setEditFormData({ title: classItem.title, date: classItem.date, time: classItem.time });
  };

  const saveEditing = async () => {
    try {
      await updateDoc(doc(db, 'classes', editingClassId), {
        title: editFormData.title,
        date: editFormData.date,
        time: editFormData.time
      });
      setEditingClassId(null);
    } catch (error) {
      console.error("Error updating class:", error);
    }
  };

  const handleBook = async (classItem: any) => {
    if (!isBookingTimeAllowed && currentUserProfile.role !== 'admin') {
      alert("Booking is currently closed based on system settings.");
      return;
    }
    
    const classRef = doc(db, 'classes', classItem.id);
    let newBooked = [...(classItem.booked || [])];
    let newWaitlist = [...(classItem.waitlist || [])];

    if (newBooked.length < 2) {
      newBooked.push({ ...currentUserProfile, status: 'confirmed' });
    } else {
      newWaitlist.push(currentUserProfile);
    }

    await updateDoc(classRef, { booked: newBooked, waitlist: newWaitlist });
  };

  const handleCancel = async (classItem: any) => {
    const classRef = doc(db, 'classes', classItem.id);
    let newBooked = (classItem.booked || []).filter((b: any) => b.id !== currentUserProfile.id);
    let newWaitlist = (classItem.waitlist || []).filter((w: any) => w.id !== currentUserProfile.id);
    
    if (newBooked.length < (classItem.booked || []).length && newWaitlist.length > 0) {
      const nextInLine = newWaitlist.shift(); 
      newBooked.push({ ...nextInLine, status: 'pending' }); 
    }
    
    await updateDoc(classRef, { booked: newBooked, waitlist: newWaitlist });
  };

  const handleAdminConfirm = async (classItem: any, userId: string) => {
    const classRef = doc(db, 'classes', classItem.id);
    const newBooked = (classItem.booked || []).map((b: any) => b.id === userId ? { ...b, status: 'confirmed' } : b);
    await updateDoc(classRef, { booked: newBooked });
  };

  const handleAdminSkip = async (classItem: any, userId: string) => {
    const classRef = doc(db, 'classes', classItem.id);
    let newBooked = (classItem.booked || []).filter((b: any) => b.id !== userId);
    let newWaitlist = [...(classItem.waitlist || [])];
    
    if (newWaitlist.length > 0) {
      const nextInLine = newWaitlist.shift();
      newBooked.push({ ...nextInLine, status: 'pending' });
    }
    
    await updateDoc(classRef, { booked: newBooked, waitlist: newWaitlist });
  };

  // ============================================================================
  // UI COMPONENTS
  // ============================================================================

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-800">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-slate-100">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
              <CalendarIcon className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-center">Studio Sign In</h1>
            <p className="text-sm text-slate-500 mt-2 text-center">Enter your email and password.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center font-medium border border-red-100">{loginError}</div>}
            
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Email Address</label>
              <input 
                type="email" required
                value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Password</label>
              <input 
                type="password" required
                value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-sm">
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  const renderClassCard = (classItem: any) => {
    const bookedArray = classItem.booked || [];
    const waitlistArray = classItem.waitlist || [];
    const isFull = bookedArray.length >= 2;
    const myBooking = bookedArray.find((b: any) => b.id === currentUserProfile.id);
    const myWaitlist = waitlistArray.find((w: any) => w.id === currentUserProfile.id);
    const myStatus = myBooking ? myBooking.status : (myWaitlist ? 'waitlist' : 'none');
    const hasPendingUser = currentUserProfile.role === 'admin' && bookedArray.some((b: any) => b.status === 'pending');
    const isEditing = editingClassId === classItem.id;

    return (
      <div key={classItem.id} className={`bg-white rounded-2xl shadow-sm border transition-all w-full ${hasPendingUser ? 'border-orange-400 ring-2 ring-orange-50' : 'border-slate-200'}`}>
        <div className="p-5 md:p-6 flex flex-col md:flex-row justify-between gap-5">
          <div className="flex-1 w-full">
            {isEditing ? (
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 mb-4 w-full">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-blue-900">Edit Class</h3>
                  <button onClick={() => setEditingClassId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 w-full">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Title</label>
                    <input type="text" value={editFormData.title} onChange={e => setEditFormData({...editFormData, title: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Date</label>
                    <input type="date" value={editFormData.date} onChange={e => setEditFormData({...editFormData, date: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Time</label>
                    <input type="time" value={editFormData.time} onChange={e => setEditFormData({...editFormData, time: e.target.value})} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  </div>
                </div>
                <button onClick={saveEditing} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center justify-center w-full sm:w-auto gap-2 hover:bg-blue-700">
                  <Save className="w-4 h-4"/> Save
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h3 className="text-lg md:text-xl font-bold text-slate-900">{classItem.title}</h3>
                  {hasPendingUser && (
                    <span className="bg-orange-100 text-orange-700 text-xs px-3 py-1 rounded-full font-bold flex items-center animate-pulse">
                      <AlertCircle className="w-3.5 h-3.5 mr-1" /> Action Required
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 md:gap-6 text-sm text-slate-600 mb-4">
                  <div className="flex items-center bg-slate-100 px-3 py-1.5 rounded-lg font-medium">
                    <CalendarIcon className="w-4 h-4 mr-2 text-blue-500" /> {new Date(classItem.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="flex items-center bg-slate-100 px-3 py-1.5 rounded-lg font-medium">
                    <Clock className="w-4 h-4 mr-2 text-blue-500" /> {classItem.time}
                  </div>
                  <div className={`flex items-center px-3 py-1.5 rounded-lg font-bold ${isFull ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                    <Users className="w-4 h-4 mr-2" /> 
                    {bookedArray.length} / 2 Slots
                  </div>
                </div>
              </>
            )}

            {currentUserProfile.role === 'admin' && !isEditing && (
              <div className="bg-slate-50 rounded-xl p-4 text-sm border border-slate-200 w-full">
                <p className="font-bold text-slate-800 mb-2">Attendees</p>
                {bookedArray.length === 0 ? <p className="text-slate-500 text-sm mb-4 italic">No attendees yet.</p> : (
                  <ul className="space-y-2 mb-4">
                    {bookedArray.map((b: any, i: number) => (
                      <li key={i} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm gap-3">
                        <span className="font-medium text-slate-800 flex flex-wrap items-center gap-2">
                          {b.name} 
                          {b.status === 'pending' && <span className="text-xs text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200">(Pending Call)</span>}
                          {b.status === 'confirmed' && <span className="text-xs text-green-600 font-bold flex items-center bg-green-50 px-2 py-0.5 rounded-md"><CheckCircle className="w-3 h-3 mr-1"/>Confirmed</span>}
                        </span>
                        {b.status === 'pending' && (
                          <div className="flex gap-2 w-full sm:w-auto">
                            <button onClick={() => handleAdminConfirm(classItem, b.id)} className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-2 rounded-lg font-bold">Confirm</button>
                            <button onClick={() => handleAdminSkip(classItem, b.id)} className="flex-1 sm:flex-none bg-red-100 hover:bg-red-200 text-red-700 text-xs px-4 py-2 rounded-lg font-bold">Skip</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="font-bold text-slate-800 mb-2">Waitlist</p>
                {waitlistArray.length === 0 ? <p className="text-slate-500 text-sm italic">Queue is empty.</p> : (
                  <div className="flex flex-wrap gap-2">
                    {waitlistArray.map((w: any, i: number) => (
                      <div key={i} className="bg-white border border-slate-200 text-slate-700 flex items-center text-xs font-medium px-3 py-1.5 rounded-lg shadow-sm">
                        <span className="bg-slate-200 text-slate-800 rounded px-1.5 py-0.5 mr-2 font-bold">No.{i+1}</span> {w.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center items-stretch md:items-end w-full md:w-auto md:min-w-[160px] mt-2 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-slate-200 md:pl-6">
            {currentUserProfile.role === 'admin' ? (
               <div className="flex flex-row md:flex-col gap-2 w-full justify-end">
                 <button onClick={() => startEditing(classItem)} disabled={isEditing} className="flex-1 md:flex-none text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-4 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
                   <Edit2 className="w-4 h-4" /> Edit
                 </button>
                 <button onClick={() => deleteClass(classItem.id)} className="flex-1 md:flex-none text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-4 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5">
                   <AlertCircle className="w-4 h-4" /> Delete
                 </button>
               </div>
            ) : (
              <>
                {myStatus === 'none' && (
                  <button onClick={() => handleBook(classItem)} disabled={!isBookingTimeAllowed}
                    className={`w-full py-3 px-6 rounded-xl font-bold text-sm transition-all shadow-sm
                      ${!isBookingTimeAllowed ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : isFull ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                  >
                    {isFull ? 'Join Waitlist' : 'Book Spot'}
                  </button>
                )}
                {(myStatus === 'confirmed' || myStatus === 'pending') && (
                  <div className="text-center w-full bg-slate-50 md:bg-transparent p-4 md:p-0 rounded-xl md:rounded-none">
                    <div className={`text-sm font-bold mb-3 md:mb-4 flex items-center justify-center ${myStatus === 'pending' ? 'text-orange-600' : 'text-green-600'}`}>
                      <CheckCircle className="w-5 h-5 mr-1.5" /> 
                      {myStatus === 'pending' ? 'Pending Approval' : 'Booking Confirmed'}
                    </div>
                    <button onClick={() => handleCancel(classItem)} className="w-full py-2.5 bg-white border-2 border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200 rounded-xl text-sm font-bold transition-colors">
                      Cancel Booking
                    </button>
                  </div>
                )}
                {myStatus === 'waitlist' && (
                  <div className="text-center w-full">
                    <div className="text-sm text-slate-700 mb-3 md:mb-4 bg-orange-50 p-3 md:p-4 rounded-xl border border-orange-100">
                      <span className="block font-bold mb-1">On Waitlist</span>
                      Position: <span className="text-orange-600 font-bold text-lg ml-1">{waitlistArray.findIndex((w: any) => w.id === currentUserProfile.id) + 1}</span>
                    </div>
                    <button onClick={() => handleCancel(classItem)} className="w-full py-2.5 text-slate-500 hover:text-red-600 text-sm font-medium transition-colors underline underline-offset-2">
                      Leave Queue
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCalendarGrid = () => {
    const days = viewMode === 'month' ? getMonthCalendarDays() : getWeekCalendarDays();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <div className="w-full overflow-x-auto pb-4 hide-scrollbar">
        <div className="min-w-[700px] w-full">
          <div className="grid grid-cols-7 border-b border-slate-200 mb-2">
            {dayNames.map(day => <div key={day} className="py-2 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">{day}</div>)}
          </div>
          
          <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {days.map((dayObj, i) => {
              const dayClasses = getClassesForDate(dayObj.date);
              const isToday = dayObj.date.toDateString() === new Date().toDateString();

              return (
                <div key={i} className={`min-h-[120px] p-1.5 flex flex-col bg-white ${!dayObj.isCurrentMonth && viewMode === 'month' ? 'bg-slate-50/50 opacity-60' : ''}`}>
                  <div className="flex justify-between items-start mb-1 px-1">
                    <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-slate-700'}`}>
                      {dayObj.date.getDate()}
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-1 overflow-y-auto pr-1">
                    {dayClasses.map((c: any) => {
                      const bookedArray = c.booked || [];
                      const waitlistArray = c.waitlist || [];
                      const isFull = bookedArray.length >= 2;
                      const hasMyBooking = bookedArray.find((b: any) => b.id === currentUserProfile.id);
                      const hasMyWaitlist = waitlistArray.find((w: any) => w.id === currentUserProfile.id);
                      const needsAdminAction = currentUserProfile.role === 'admin' && bookedArray.some((b: any) => b.status === 'pending');
                      
                      let pillColor = 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200';
                      if (hasMyBooking) pillColor = 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200';
                      else if (hasMyWaitlist) pillColor = 'bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200';
                      else if (needsAdminAction) pillColor = 'bg-orange-100 hover:bg-orange-200 text-orange-800 border-orange-300 font-bold';
                      else if (isFull) pillColor = 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200';

                      return (
                        <button key={c.id} onClick={() => setSelectedClassId(c.id)}
                          className={`text-left text-xs p-1.5 rounded-md border truncate w-full transition-colors cursor-pointer flex items-center ${pillColor}`}
                          title={`${c.time} - ${c.title}`}
                        >
                          <span className="font-bold mr-1 shrink-0">{c.time}</span>
                          <span className="truncate">{c.title}</span>
                          {needsAdminAction && <AlertCircle className="w-3 h-3 ml-auto shrink-0 animate-pulse"/>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-24 text-slate-800">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Header */}
      <header className="bg-white sticky top-0 z-30 border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 flex justify-between items-center">
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-blue-700">
            <CalendarIcon className="text-blue-600 w-6 h-6" /> Studio Booking
          </h1>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-bold text-slate-800">{currentUserProfile?.name}</span>
              <span className="text-xs text-slate-500 uppercase tracking-wider">{currentUserProfile?.role}</span>
            </div>
            <button onClick={handleLogout} className="p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600 rounded-lg transition-colors" title="Log Out">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-6 mt-2 md:mt-4">
        
        {/* Admin Tools Area */}
        {currentUserProfile?.role === 'admin' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            
            {/* Admin Multi-mode Creation Tool */}
            <div className="md:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              
              <datalist id="past-class-titles">
                {uniqueClassTitles.map((t: any) => <option key={t} value={t} />)}
              </datalist>

              <div className="flex border-b border-slate-200 mb-4 gap-4 overflow-x-auto hide-scrollbar">
                <button onClick={() => setAdminCreationTab('recurring')} className={`pb-2 whitespace-nowrap text-sm font-bold flex items-center gap-1 ${adminCreationTab === 'recurring' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                  <Repeat className="w-4 h-4"/> สร้างรายสัปดาห์
                </button>
                <button onClick={() => setAdminCreationTab('csv')} className={`pb-2 whitespace-nowrap text-sm font-bold flex items-center gap-1 ${adminCreationTab === 'csv' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                  <Upload className="w-4 h-4"/> อัปโหลด CSV
                </button>
                <button onClick={() => setAdminCreationTab('ai')} className={`pb-2 whitespace-nowrap text-sm font-bold flex items-center gap-1 ${adminCreationTab === 'ai' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                  <Sparkles className="w-4 h-4"/> ให้ AI ช่วยสร้าง
                </button>
              </div>

              {adminCreationTab === 'recurring' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">ชื่อคลาส</label>
                      <input list="past-class-titles" type="text" placeholder="เช่น Basic Pilates" value={recurringData.title} onChange={e => setRecurringData({...recurringData, title: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">เวลา</label>
                      <input type="time" value={recurringData.time} onChange={e => setRecurringData({...recurringData, time: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">เริ่มตั้งแต่วันที่</label>
                      <input type="date" value={recurringData.startDate} onChange={e => setRecurringData({...recurringData, startDate: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">สิ้นสุดวันที่</label>
                      <input type="date" value={recurringData.endDate} onChange={e => setRecurringData({...recurringData, endDate: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-2">เปิดสอนทุกวัน</label>
                    <div className="flex flex-wrap gap-2">
                      {[{id:0, n:'อา.'}, {id:1, n:'จ.'}, {id:2, n:'อ.'}, {id:3, n:'พ.'}, {id:4, n:'พฤ.'}, {id:5, n:'ศ.'}, {id:6, n:'ส.'}].map(day => (
                        <button 
                          key={day.id} 
                          onClick={() => {
                            const newDays = recurringData.days.includes(day.id) 
                              ? recurringData.days.filter(d => d !== day.id) 
                              : [...recurringData.days, day.id];
                            setRecurringData({...recurringData, days: newDays});
                          }}
                          className={`w-10 h-10 rounded-full font-bold text-sm transition-colors ${recurringData.days.includes(day.id) ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          {day.n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleRecurringCreate} disabled={isProcessingBulk} className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                    {isProcessingBulk ? 'กำลังสร้าง...' : 'เพิ่มคลาสทั้งหมดลงตาราง'}
                  </button>
                </div>
              )}

              {adminCreationTab === 'csv' && (
                <div className="space-y-4 animate-in fade-in duration-300 py-4">
                  <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-sm text-blue-800">
                    <p className="font-bold mb-1">รูปแบบไฟล์ CSV ที่รองรับ:</p>
                    <p>ชื่อคลาส, วันที่(YYYY-MM-DD), เวลา(HH:mm)</p>
                  </div>
                  <input type="file" accept=".csv" onChange={handleCsvUpload} disabled={isProcessingBulk} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer border border-slate-200 rounded-lg" />
                  {isProcessingBulk && <p className="text-sm text-blue-600 font-bold animate-pulse mt-2">กำลังนำเข้าข้อมูล...</p>}
                </div>
              )}

              {adminCreationTab === 'ai' && (
                <div className="space-y-4 animate-in fade-in duration-300 py-2">
                  <p className="text-sm text-slate-600">พิมพ์คำสั่งภาษาธรรมดาเพื่อสร้างคลาส (เช่น "Zumba tomorrow 18:00")</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input type="text" value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Class details..." className="flex-1 bg-white border border-slate-300 px-4 py-3 rounded-xl outline-none focus:border-blue-500 focus:ring-2" onKeyPress={(e) => e.key === 'Enter' && handleAiCreateClass()} />
                    <button onClick={handleAiCreateClass} disabled={isProcessingBulk || !aiInput.trim()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                      {isProcessingBulk && adminCreationTab === 'ai' ? 'กำลังคิด...' : 'สร้างคลาส'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-100 rounded-2xl p-6 border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-600" /> Booking Window
              </h2>
              <div className="flex items-center gap-2 mt-4">
                <div className="flex flex-col flex-1">
                  <label className="text-xs font-semibold text-slate-500 mb-1">Opens (Hour)</label>
                  <input type="number" min="0" max="23" value={bookingStartHour} onChange={(e) => setBookingStartHour(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
                </div>
                <span className="text-slate-400 font-bold mt-5">-</span>
                <div className="flex flex-col flex-1">
                  <label className="text-xs font-semibold text-slate-500 mb-1">Closes (Hour)</label>
                  <input type="number" min="0" max="23" value={bookingEndHour} onChange={(e) => setBookingEndHour(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Alert */}
        {currentUserProfile?.role !== 'admin' && !isBookingTimeAllowed && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 flex items-center gap-3 border border-red-100">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <div>
              <p className="font-bold">Booking is currently closed.</p>
              <p className="text-sm">The system only accepts bookings between {bookingStartHour}:00 and {bookingEndHour}:00.</p>
            </div>
          </div>
        )}

        {/* View Controls & Navigation */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div className={`flex items-center gap-4 w-full md:w-auto justify-between ${viewMode === 'my-bookings' ? 'hidden md:flex md:invisible' : ''}`}>
            <button onClick={() => navigateDate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ChevronLeft className="w-5 h-5 text-slate-600" /></button>
            <h2 className="text-lg font-bold text-slate-800 text-center min-w-[180px]">{getDisplayDateRange()}</h2>
            <button onClick={() => navigateDate(1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ChevronRight className="w-5 h-5 text-slate-600" /></button>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto hide-scrollbar">
            {['day', 'week', 'month'].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} className={`flex-1 md:px-6 py-2 text-sm font-bold capitalize transition-all rounded-lg min-w-[70px] ${viewMode === mode ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {mode}
              </button>
            ))}
            {currentUserProfile?.role !== 'admin' && (
              <button onClick={() => setViewMode('my-bookings')} className={`flex-1 px-4 md:px-6 py-2 text-sm font-bold transition-all rounded-lg whitespace-nowrap min-w-[110px] ${viewMode === 'my-bookings' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                My Bookings
              </button>
            )}
          </div>
        </div>

        {/* Content Views */}
        {viewMode === 'my-bookings' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2 mb-4">
              <h2 className="text-xl font-bold text-slate-800">Your Upcoming Classes</h2>
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">{myClasses.length} Total</span>
            </div>
            {myClasses.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500">
                <CalendarIcon className="w-12 h-12 mb-3 text-slate-300" />
                <p className="font-medium text-lg">You have no upcoming bookings.</p>
              </div>
            ) : myClasses.map((c: any) => renderClassCard(c))}
          </div>
        ) : viewMode === 'day' ? (
          <div className="space-y-4">
            {filteredClassesDayView.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500">
                <CalendarIcon className="w-12 h-12 mb-3 text-slate-300" />
                <p className="font-medium text-lg">No classes scheduled for today.</p>
              </div>
            ) : filteredClassesDayView.map((c: any) => renderClassCard(c))}
          </div>
        ) : renderCalendarGrid()}

      </main>

      {/* Modal */}
      {selectedClassId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
            <div className="sticky top-0 right-0 z-10 flex justify-end p-2 bg-gradient-to-b from-white via-white to-transparent">
               <button onClick={() => { setSelectedClassId(null); setEditingClassId(null); }} className="bg-slate-100 hover:bg-slate-200 p-2 rounded-full text-slate-600 transition-colors">
                  <X className="w-5 h-5" />
               </button>
            </div>
            <div className="px-4 pb-6 pt-2">
               {classes.find(c => c.id === selectedClassId) ? renderClassCard(classes.find(c => c.id === selectedClassId)) : <p>Class not found.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}