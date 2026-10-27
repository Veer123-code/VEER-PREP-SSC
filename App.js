import React, {useState, useEffect, useRef} from 'react';
import nativeAuth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  View, Text, ScrollView, TouchableOpacity, Image, Animated, Easing, Platform, useWindowDimensions,
  TextInput, StyleSheet, StatusBar, Linking, AppState, Alert
} from 'react-native';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithCustomToken,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
/* VEER_NOTIFICATIONS_IMPORT */
import { auth, db } from './firebase';
import {
  collection, query, orderBy, limit, onSnapshot,
  doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const BLUE = '#173B83';
const BG = '#F3F6FC';
const ARTICLES_API = 'https://' + 'study-with-veer-payment-backend.onrender.com';

export default function App() {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const loadingSpin = useRef(new Animated.Value(0)).current;
  const purchasedMarquee = useRef(new Animated.Value(0)).current;
const [purchasedMarqueeTextWidth, setPurchasedMarqueeTextWidth] = useState(0);

  useEffect(() => {
  if (!purchasedMarqueeTextWidth) return;
  purchasedMarquee.setValue(0);
  const animation = Animated.loop(
    Animated.timing(purchasedMarquee, {
      toValue: 1,
      duration: 12000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    })
  );
  animation.start();
  return () => animation.stop();
}, [purchasedMarquee, purchasedMarqueeTextWidth]);

  const heroSpin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.timing(heroSpin, {
      toValue: 1,
      duration: 3000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [heroSpin]);
  useEffect(() => {
    const ringAnimation = Animated.loop(
      Animated.timing(loadingSpin, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: false,
      })
    );
    ringAnimation.start();
    return () => ringAnimation.stop();
  }, [loadingSpin]);
  const [loggedIn, setLoggedIn] = useState(false);
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    AsyncStorage.getItem('study_with_veer_language')
      .then(saved => {
        if (saved === 'en' || saved === 'te') setLanguage(saved);
      })
      .catch(() => {});
  }, []);

  const changeLanguage = async (nextLanguage) => {
    setLanguage(nextLanguage);
    try {
      await AsyncStorage.setItem('study_with_veer_language', nextLanguage);
    } catch (error) {}
  };

  const t = (english, telugu) => language === 'te' ? telugu : english;

  const [offlinePdfs, setOfflinePdfs] = useState([]);
  const [pdfDownloadBusy, setPdfDownloadBusy] = useState(false);

  const loadOfflinePdfs = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        setOfflinePdfs([]);
        return;
      }
      const saved = await AsyncStorage.getItem('veer_offline_pdfs_' + user.uid);
      setOfflinePdfs(saved ? JSON.parse(saved) : []);
    } catch (error) {
      console.log('Could not load offline PDFs:', error.message);
    }
  };



  const downloadStudyPdfForOffline = async (endpoint, fileName) => {
    setPdfDownloadBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please log in again.');
      const token = await user.getIdToken();

      const isDirectUrl = !endpoint.includes('study-with-veer-payment-backend.onrender.com');
      let pdfUrl = endpoint;

      if (!isDirectUrl) {
        console.log('Offline PDF request:', {
          endpoint,
          userAvailable: !!user,
          tokenAvailable: !!token,
          tokenLength: token ? token.length : 0
        });
        const response = await fetch(endpoint, {
          headers: { Authorization: 'Bearer ' + token }
        });
        const data = await response.json();
        if (!response.ok || !data.url) {
          throw new Error((data.error || 'Could not access this PDF.') + ' (HTTP ' + response.status + ')');
        }
        pdfUrl = data.url;
      }

      if (Platform.OS === 'web' && isDirectUrl) {
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        Alert.alert('Download opened', 'Google Drive download open ayyindi. PDF save cheyyadaniki browser menu lo Download option select cheyyi.');
        return;
      }

      if (Platform.OS === 'web') {
        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) throw new Error('PDF download failed.');
        const blob = await pdfResponse.blob();
        const storageKey = user.uid + '::' + fileName;
        await new Promise((resolve, reject) => {
          const request = indexedDB.open('study-with-veer-pdfs', 1);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains('pdfs')) {
              request.result.createObjectStore('pdfs');
            }
          };
          request.onerror = () => reject(request.error || new Error('Browser storage could not open.'));
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('pdfs', 'readwrite');
            tx.objectStore('pdfs').put(blob, storageKey);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error || new Error('PDF could not be saved in browser storage.')); };
            tx.onabort = () => { db.close(); reject(tx.error || new Error('PDF save was cancelled.')); };
          };
        });

        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

        const existing = await AsyncStorage.getItem('veer_offline_pdfs_' + user.uid);
        const list = existing ? JSON.parse(existing) : [];
        const updated = [
          { name: fileName, uri: 'indexeddb:' + storageKey, savedAt: new Date().toISOString() },
          ...list.filter(item => item.name !== fileName)
        ];
        await AsyncStorage.setItem('veer_offline_pdfs_' + user.uid, JSON.stringify(updated));
        setOfflinePdfs(updated);
        Alert.alert('Download started', 'Check your browser downloads.');
        return;
      }

      if (!FileSystem.documentDirectory) {
        throw new Error('Permanent app storage is unavailable on this device.');
      }

      const folder = FileSystem.documentDirectory + 'study-pdfs/';
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileUri = folder + safeName;
      const result = await FileSystem.downloadAsync(pdfUrl, fileUri);

      if (result.status !== 200) {
        throw new Error('PDF download failed. Please try again.');
      }

      const existing = await AsyncStorage.getItem('veer_offline_pdfs_' + user.uid);
      const list = existing ? JSON.parse(existing) : [];
      const updated = [
        { name: fileName, uri: result.uri, savedAt: new Date().toISOString() },
        ...list.filter(item => item.uri !== result.uri && item.name !== fileName)
      ];
      await AsyncStorage.setItem('veer_offline_pdfs_' + user.uid, JSON.stringify(updated));
      setOfflinePdfs(updated);
      Alert.alert('PDF saved', 'PDF is saved on this phone for offline access.');
    } catch (error) {
      Alert.alert('PDF download error', error.message || 'Please try again.');
    } finally {
      setPdfDownloadBusy(false);
    }
  };

  const [unlockedCourses, setUnlockedCourses] = useState({});
  const [generalAwarenessFiles, setGeneralAwarenessFiles] = useState([]);
  const [generalAwarenessFolders, setGeneralAwarenessFolders] = useState([]);
  const [generalAwarenessLoading, setGeneralAwarenessLoading] = useState(false);
  const [generalAwarenessError, setGeneralAwarenessError] = useState('');

  const [authLoading, setAuthLoading] = useState(true);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const pageBg = darkMode ? '#0B1220' : '#F1F5FB';
  const cardBg = darkMode ? '#172337' : '#FFFFFF';
  const mainText = darkMode ? '#F1F5F9' : '#102A56';
  const mutedText = darkMode ? '#B0BDD0' : '#64748B';
  const [authError, setAuthError] = useState('');
  const [purchasePopupName, setPurchasePopupName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [fullName, setFullName] = useState('');
const [fullNameFocused, setFullNameFocused] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [phoneLoginMode, setPhoneLoginMode] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const phoneConfirmationRef = useRef(null);
  const webRecaptchaRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let style = document.getElementById('veer-floating-label-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'veer-floating-label-style';
    }
    style.textContent = `

      .veer-space-btn {
        position: relative !important;
        isolation: isolate !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 100% !important;
        min-height: 54px !important;
        box-sizing: border-box !important;
        padding: 12px 18px !important;
        overflow: hidden !important;
        border: 4px double transparent !important;
        border-radius: 50px !important;
        background-image:
          linear-gradient(#212121,#212121),
          linear-gradient(137.48deg,#ffdb3b 10%,#fe53bb 45%,#8f51ea 67%,#0044ff 87%) !important;
        background-origin: border-box !important;
        background-clip: padding-box,border-box !important;
        background-size: 300% 300% !important;
        animation: veer-gradient 5s ease infinite !important;
        cursor: pointer !important;
      }
      .veer-space-btn::before {
        content: "";
        position: absolute;
        inset: 3px;
        z-index: 0;
        pointer-events: none;
        border-radius: 50px;
        background-image: radial-gradient(#fff 1px,transparent 1.5px);
        background-size: 24px 24px;
        opacity: .28;
        animation: veer-stars 25s linear infinite;
      }
      .veer-space-btn::after {
        content: "";
        position: absolute;
        z-index: 0;
        width: 55%;
        height: 18px;
        left: 22.5%;
        top: 17px;
        border-radius: 50%;
        background: linear-gradient(90deg,rgba(254,83,186,.7),rgba(142,81,234,.7));
        filter: blur(12px);
        opacity: .65;
        pointer-events: none;
        animation: veer-pulse 4s ease-in-out infinite;
      }

      [class~="veer-space-btn"] {
        border: 4px double transparent !important;
        background-color: #212121 !important;
        background-image:
          linear-gradient(#212121,#212121),
          linear-gradient(137.48deg,#ffdb3b 10%,#fe53bb 45%,#8f51ea 67%,#0044ff 87%) !important;
        background-origin: border-box !important;
        background-clip: padding-box,border-box !important;
        background-size: 300% 300% !important;
        animation: veer-gradient 5s ease infinite !important;
      }
      [class~="veer-space-btn"]::before {
        content: "" !important;
        position: absolute !important;
        inset: 3px !important;
        pointer-events: none !important;
        background-image: radial-gradient(#fff 1px,transparent 1.5px) !important;
        background-size: 24px 24px !important;
        opacity: .35 !important;
        animation: veer-stars 25s linear infinite !important;
      }
      [class~="veer-space-btn"]::after {
        content: "" !important;
        position: absolute !important;
        width: 55% !important;
        height: 18px !important;
        left: 22.5% !important;
        top: 17px !important;
        border-radius: 50% !important;
        background: linear-gradient(90deg,rgba(254,83,186,.7),rgba(142,81,234,.7)) !important;
        filter: blur(12px) !important;
        opacity: .65 !important;
        pointer-events: none !important;
        animation: veer-pulse 4s ease-in-out infinite !important;
      }
      .veer-space-btn:hover { transform: scale(1.03); }
      .veer-space-btn:active { border-color: #fe53bb !important; }
      .veer-space-btn:disabled { opacity: .65; }
      .veer-space-btn::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image: radial-gradient(#fff 1px,transparent 1.5px);
        background-size: 24px 24px;
        opacity: .42;
        animation: veer-stars 25s linear infinite;
      }
      .veer-space-btn::after {
        content: "";
        position: absolute;
        width: 55%;
        height: 22px;
        left: 22.5%;
        top: 15px;
        border-radius: 50%;
        background: linear-gradient(90deg,rgba(254,83,186,.8),rgba(142,81,234,.8));
        filter: blur(16px);
        pointer-events: none;
        animation: veer-pulse 4s ease-in-out infinite;
      }
      .veer-space-content {
        position: relative !important;
        z-index: 2 !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 9px !important;
      }
      .veer-space-text {
        color: #fff !important;
        font-size: 13px !important;
        font-weight: 800 !important;
        letter-spacing: 3px !important;
        text-align: center !important;
        text-shadow: 0 0 5px #fff !important;
      }
      @keyframes veerButtonColorFlow {
        0%,100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }
      @media (prefers-reduced-motion: reduce) {
        .veer-space-btn { animation: none !important; }
      }
      @keyframes veer-stars {
        from { background-position: 0 0; }
        to { background-position: 120px -120px; }
      }
      @keyframes veer-gradient {
        0%,100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }
      @keyframes veer-pulse {
        0%,100% { transform: scale(.75); opacity: .55; }
        50% { transform: scale(1.15); opacity: 1; }
      }


      #veer-login-space, #veer-create-space {
        border: 4px double transparent !important;
        background-color: #212121 !important;
        background-image:
          linear-gradient(#212121,#212121),
          linear-gradient(137.48deg,#ffdb3b 10%,#fe53bb 45%,#8f51ea 67%,#0044ff 87%) !important;
        background-origin: border-box !important;
        background-clip: padding-box,border-box !important;
        background-size: 300% 300% !important;
        animation: veer-gradient 5s ease infinite !important;
        isolation: isolate !important;
      }
      #veer-login-space::before, #veer-create-space::before {
        content: "" !important;
        position: absolute !important;
        inset: 3px !important;
        z-index: 1 !important;
        pointer-events: none !important;
        border-radius: 50px !important;
        background-image: radial-gradient(#fff 1px,transparent 1.5px) !important;
        background-size: 24px 24px !important;
        opacity: .5 !important;
        animation: veer-stars 25s linear infinite !important;
      }
      #veer-login-space::after, #veer-create-space::after {
        content: "" !important;
        position: absolute !important;
        z-index: 1 !important;
        width: 55% !important;
        height: 18px !important;
        left: 22.5% !important;
        top: 17px !important;
        border-radius: 50% !important;
        background: linear-gradient(90deg,rgba(254,83,186,.7),rgba(142,81,234,.7)) !important;
        filter: blur(12px) !important;
        pointer-events: none !important;
        animation: veer-pulse 4s ease-in-out infinite !important;
      }
      #veer-auth-card::before {
        content: "" !important;
        position: absolute !important;
        width: 200% !important;
        height: 200% !important;
        left: -50% !important;
        top: -50% !important;
        border-radius: 50% !important;
        background: conic-gradient(from 0deg, transparent 0deg 285deg, #ff0000 310deg, #ff4545 330deg, transparent 355deg 360deg) !important;
        animation: veer-red-spin 2.2s linear infinite !important;
        pointer-events: none !important;
        z-index: 0 !important;
      }
      @keyframes veer-red-spin {
        to { transform: rotate(360deg); }
      }

      .veer-label-letter {
        display: inline-block !important;
        transition-property: transform !important;
        transition-duration: 300ms !important;
        transition-timing-function: cubic-bezier(0.68,-0.55,0.265,1.55) !important;
      }
      .veer-label-letter.active {
        transform: translate3d(0,-30px,0) !important;
      }
    `;
    document.head.appendChild(style);
  }, []);

  const fullNameLetterAnims = useRef('Full Name'.split('').map(() => new Animated.Value(0))).current;
  const emailLetterAnims = useRef('Email'.split('').map(() => new Animated.Value(0))).current;
  const passwordLetterAnims = useRef('Password'.split('').map(() => new Animated.Value(0))).current;
  const redBlobAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(redBlobAnim, {
        toValue: 1,
        duration: 6000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, []);



  useEffect(() => {
    Animated.stagger(50, fullNameLetterAnims.map(anim => Animated.timing(anim, {
      toValue: (fullNameFocused || !!fullName) ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }))).start();
  }, [fullNameFocused, !!fullName]);

  useEffect(() => {
    Animated.stagger(50, emailLetterAnims.map(anim => Animated.timing(anim, {
      toValue: (emailFocused || !!email) ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }))).start();
  }, [emailFocused, !!email]);

  useEffect(() => {
    Animated.stagger(50, passwordLetterAnims.map(anim => Animated.timing(anim, {
      toValue: (passwordFocused || !!password) ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }))).start();
  }, [passwordFocused, !!password]);

  const [showPassword, setShowPassword] = useState(false);
  const [showAccountSuccess, setShowAccountSuccess] = useState(false);
  const [accountSuccessName, setAccountSuccessName] = useState('');
  const successScale = useRef(new Animated.Value(0.65)).current;
  const successFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showAccountSuccess) return;
    successScale.setValue(0.65);
    successFade.setValue(0);
    const animation = Animated.parallel([
      Animated.spring(successScale, {
        toValue: 1,
        friction: 5,
        tension: 65,
        useNativeDriver: true,
      }),
      Animated.timing(successFade, {
        toValue: 1,
        duration: 550,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [showAccountSuccess, successScale, successFade]);

  const [page, setPage] = useState('Courses');

  useEffect(() => {
    if (page === 'Downloads' && loggedIn) loadOfflinePdfs();
  }, [page, loggedIn]);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const unreadNotifications = notifications.filter(item => !item.readAt).length;

  // VEER_SUPPORT_CHAT_STATE
  const [chatConversations, setChatConversations] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const chatInputRef = useRef(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [chatNotice, setChatNotice] = useState('');

  // VEER_ADMIN_NOTIFICATION_FORM
  const [isNotificationAdmin, setIsNotificationAdmin] = useState(false);
  const [adminStatusChecked, setAdminStatusChecked] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function checkNotificationAdmin() {
      setIsNotificationAdmin(false);
      setAdminStatusChecked(false);
      const user = auth.currentUser;
      if (!loggedIn || !user) return;
      try {
        const token = await user.getIdToken();
        const response = await fetch(ARTICLES_API + '/notifications/admin-status', {
          headers: { Authorization: 'Bearer ' + token }
        });
        const data = await response.json().catch(() => ({}));
        if (!cancelled) setIsNotificationAdmin(response.ok && data.isAdmin === true);
      } catch (error) {
        console.log('Admin status check failed:', error.message);
        if (!cancelled) setIsNotificationAdmin(false);
      } finally {
        if (!cancelled) setAdminStatusChecked(true);
      }
    }
    checkNotificationAdmin();
    return () => { cancelled = true; };
  }, [loggedIn]);

  const sendAdminAnnouncement = async () => {
    const user = auth.currentUser;
    const title = announcementTitle.trim();
    const body = announcementBody.trim();

    if (!user || !isNotificationAdmin) {
      setAnnouncementMessage('Admin permission required.');
      return;
    }
    if (!title || title.length > 80 || !body || body.length > 300) {
      setAnnouncementMessage('Title is required (max 80 characters) and message is required (max 300 characters).');
      return;
    }

    setAnnouncementBusy(true);
    setAnnouncementMessage('');
    try {
      const token = await user.getIdToken();
      const response = await fetch(ARTICLES_API + '/notifications/send', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title, body })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Notification could not be sent.');
      setAnnouncementTitle('');
      setAnnouncementBody('');
      setAnnouncementMessage(
        'Sent! Notified users: ' + (data.notifiedUsers ?? 0) +
        '. Push accepted by Expo: ' + (data.pushAccepted ?? 0) + '.'
      );
    } catch (error) {
      setAnnouncementMessage(error.message || 'Notification could not be sent.');
    } finally {
      setAnnouncementBusy(false);
    }
  };


  // VEER_SUPPORT_CHAT_FUNCTIONS
  const chatApiRequest = async (path, options = {}) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Please log in to use Student Support Chat.');
    const token = await user.getIdToken();
    const response = await fetch(ARTICLES_API + path, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + token,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Chat request failed.');
    return data;
  };

  const loadChatConversations = async () => {
    setChatLoading(true);
    setChatError('');
    try {
      const data = await chatApiRequest('/chat/conversations');
      setChatConversations(data.conversations || []);
      if (!isNotificationAdmin && auth.currentUser?.uid) {
        setActiveChatId(auth.currentUser.uid);
      }
    } catch (error) {
      setChatError(error.message || 'Could not load chats.');
    } finally {
      setChatLoading(false);
    }
  };

  const loadChatMessages = async (chatId) => {
    if (!chatId) return;
    setChatLoading(true);
    setChatError('');
    try {
      const data = await chatApiRequest('/chat/messages/' + encodeURIComponent(chatId));
      setChatMessages(data.messages || []);
    } catch (error) {
      setChatMessages([]);
      if ((error.message || '').includes('Conversation not found')) {
        setChatError('');
      } else {
        setChatError(error.message || 'Could not load messages.');
      }
    } finally {
      setChatLoading(false);
    }
  };

  const sendChatMessage = async () => {
    const text = chatDraft.trim();
    const user = auth.currentUser;
    const chatId = isNotificationAdmin ? activeChatId : user?.uid;
    if (!user) {
      setChatError('Please log in again.');
      return;
    }
    if (!chatId) {
      setChatError('Select a student conversation first.');
      return;
    }
    if (!text || text.length > 2000) {
      setChatError('Message must be 1–2000 characters.');
      return;
    }
    setChatSending(true);
    setChatError('');
    try {
      await chatApiRequest('/chat/messages/' + encodeURIComponent(chatId), {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      setChatDraft('');
      await loadChatMessages(chatId);
      if (isNotificationAdmin) await loadChatConversations();
    } catch (error) {
      setChatError(error.message || 'Message could not be sent.');
    } finally {
      setChatSending(false);
    }
  };

  // VEER_SUPPORT_CHAT_AUTO_LOAD
  useEffect(() => {
    if (page !== 'Chat' || !loggedIn || !auth.currentUser) return;
    loadChatConversations();
    if (!isNotificationAdmin && auth.currentUser?.uid) {
      loadChatMessages(auth.currentUser.uid);
    } else if (isNotificationAdmin && activeChatId) {
      loadChatMessages(activeChatId);
    }
  }, [page, loggedIn, isNotificationAdmin, activeChatId]);

  // VEER_CHAT_AUTO_REFRESH
  useEffect(() => {
    if (page !== 'Chat' || !loggedIn || !auth.currentUser) return;

    const timer = setInterval(() => {
      if (!auth.currentUser) return;
      loadChatConversations();

      const chatId = isNotificationAdmin
        ? activeChatId
        : auth.currentUser.uid;

      if (chatId) loadChatMessages(chatId);
    }, 8000);

    return () => clearInterval(timer);
  }, [page, loggedIn, isNotificationAdmin, activeChatId]);

  // GENERAL_AWARENESS_PDF_LIST_EFFECT
  useEffect(() => {
    let cancelled = false;

    const loadGeneralAwareness = async () => {
      const isSyllabus = page === 'SSC General Awareness Syllabus';
      const isTopic = page.startsWith('SSC General Awareness Topic: ');

      if (!isSyllabus && !isTopic) return;

      setGeneralAwarenessError('');
      setGeneralAwarenessFiles([]);

      if (!(unlockedCourses['ssc-general-awareness'] || unlockedCourses['ssc-all-subjects-pack'])) {
        setGeneralAwarenessLoading(false);
        return;
      }

      setGeneralAwarenessLoading(true);

      try {
        const user = auth.currentUser;
        if (!user) throw new Error('Please log in again to access General Awareness materials.');

        const token = await user.getIdToken();

        if (isSyllabus) {
          const response = await fetch(
            ARTICLES_API + '/general-awareness/folders',
            { headers: { Authorization: 'Bearer ' + token } }
          );
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not load folders.');
          if (!cancelled) setGeneralAwarenessFolders(data.folders || []);
        } else {
          const folder = page.replace('SSC General Awareness Topic: ', '');
          const response = await fetch(
            ARTICLES_API + '/general-awareness/topic-files?topic=' + encodeURIComponent(folder),
            { headers: { Authorization: 'Bearer ' + token } }
          );
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not load PDFs.');
          if (!cancelled) setGeneralAwarenessFiles(data.files || []);
        }
      } catch (error) {
        if (!cancelled) setGeneralAwarenessError(error.message || 'Could not load General Awareness materials.');
      } finally {
        if (!cancelled) setGeneralAwarenessLoading(false);
      }
    };

    loadGeneralAwareness();
    return () => { cancelled = true; };
  }, [page, unlockedCourses]);


  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const authGlowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(authGlowAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: false,
        }),
        Animated.timing(authGlowAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [authGlowAnim]);

  const authGlowColor = authGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#15803D', '#4ADE80'],
  });

  // HOME_DASHBOARD_SLIDESHOW
  const [activeSlide, setActiveSlide] = useState(0);
  const slideImages = [
    require('./assets/slideshow/RRB.png'),
    require('./assets/slideshow/SSC.png'),
    require('./assets/slideshow/TGPSC.png'),
  ];
  useEffect(() => {
    if (!loggedIn || page !== 'Home') return;
    const timer = setInterval(() => {
      setActiveSlide(current => (current + 1) % slideImages.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [loggedIn, page]);

  const [typedTagline, setTypedTagline] = useState('');
  useEffect(() => {
    if (!loggedIn || page !== 'Home') return;
    const phrase = 'Every day brings you closer to success.';
    let i = 0;
    let deleting = false;
    let pause = 0;
    setTypedTagline('');
    const timer = setInterval(() => {
      if (pause > 0) {
        pause--;
        return;
      }
      if (!deleting) {
        i++;
        setTypedTagline(phrase.slice(0, i));
        if (i >= phrase.length) {
          deleting = true;
          pause = 14;
        }
      } else {
        i--;
        setTypedTagline(phrase.slice(0, i));
        if (i <= 0) deleting = false;
      }
    }, 65);
    return () => clearInterval(timer);
  }, [loggedIn, page]);

  const [question, setQuestion] = useState(0);
  const [currentSubject, setCurrentSubject] = useState('Mathematics');
  const [timeLeft, setTimeLeft] = useState(900);
  const [isTestPaused, setIsTestPaused] = useState(false);
  const [showCancelTestConfirm, setShowCancelTestConfirm] = useState(false);
  const [cancelTestMessage, setCancelTestMessage] = useState('');
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(null);
  const [results, setResults] = useState([]);
  const [quantTopic, setQuantTopic] = useState('');
  const [quantQuestion, setQuantQuestion] = useState(0);
  const [quantAnswers, setQuantAnswers] = useState({});
  const [quantFinished, setQuantFinished] = useState(false);
  const [quantResultSaved, setQuantResultSaved] = useState(false);


  useEffect(() => {
    AsyncStorage.getItem('study_with_veer_theme')
      .then(value => setDarkMode(value === 'dark'))
      .catch(error => console.log('Theme load failed:', error))
      .finally(() => setThemeLoaded(true));
  }, []);

  useEffect(() => {
    if (themeLoaded) {
      AsyncStorage.setItem('study_with_veer_theme', darkMode ? 'dark' : 'light')
        .catch(error => console.log('Theme save failed:', error));
    }
  }, [darkMode, themeLoaded]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setLoggedIn(!!user);
      if (user) setPage("Home");
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!loggedIn || !user) {
      setNotifications([]);
      setNotificationsLoading(false);
      setNotificationsError('');
      return;
    }

    setNotificationsLoading(true);
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, snapshot => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      setNotifications(snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .filter(item => {
          const value = item.createdAt;
          const createdMs = value && typeof value.toDate === 'function'
            ? value.toDate().getTime()
            : value && typeof value.seconds === 'number'
              ? value.seconds * 1000
              : typeof value === 'number'
                ? value
                : typeof value === 'string'
                  ? Date.parse(value)
                  : NaN;
          return Number.isFinite(createdMs) && createdMs >= cutoff;
        }));
      setNotificationsLoading(false);
      setNotificationsError('');
    }, error => {
      console.log('Notifications listener failed:', error.message);
      setNotificationsLoading(false);
      setNotificationsError(
        'Could not load notifications. Please check Firestore access.'
      );
    });

    return unsubscribe;
  }, [loggedIn]);


  // VEER_PUSH_TOKEN_REGISTRATION
  useEffect(() => {
    let cancelled = false;

    async function registerPushToken() {
      if (!loggedIn || Platform.OS !== 'android' || !Device.isDevice) return;

      try {
        const user = auth.currentUser;
        if (!user) return;

        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;

        if (status !== 'granted') {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }

        if (status !== 'granted' || cancelled) return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ||
          Constants.easConfig?.projectId;

        if (!projectId) {
          console.log('Push registration skipped: EAS project ID missing.');
          return;
        }

        const result = await Notifications.getExpoPushTokenAsync({ projectId });
        if (cancelled || !result.data) return;

        const token = await user.getIdToken();
        const response = await fetch(
          ARTICLES_API + '/notifications/register-token',
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: result.data })
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Push token registration failed.');
        }

        console.log('Push token registered successfully.');
      } catch (error) {
        console.log('Push token registration error:', error.message);
      }
    }

    registerPushToken();
    return () => { cancelled = true; };
  }, [loggedIn]);

  const markNotificationRead = async item => {
    const user = auth.currentUser;
    if (!user || !item?.id || item.readAt) return;

    try {
      await updateDoc(
        doc(db, 'users', user.uid, 'notifications', item.id),
        { readAt: serverTimestamp() }
      );
    } catch (error) {
      console.log('Mark notification read failed:', error.message);
      Alert.alert(
        'Could not update',
        'Notification read status could not be saved.'
      );
    }
  };


  const downloadInvoice = async item => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Login required', 'Please log in again to download your invoice.');
        return;
      }

      if (!item?.paymentId) {
        Alert.alert('Invoice unavailable', 'Payment ID was not found.');
        return;
      }

      const token = await user.getIdToken();
      const url = ARTICLES_API + '/invoice/' + encodeURIComponent(item.paymentId);
      const fileName = 'VEER-' + item.paymentId + '.pdf';

      if (Platform.OS === 'web') {
        const response = await fetch(url, {
          headers: { Authorization: 'Bearer ' + token }
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Invoice download failed.');
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      } else {
        const fileUri = FileSystem.cacheDirectory + fileName;
        const result = await FileSystem.downloadAsync(url, fileUri, {
          headers: { Authorization: 'Bearer ' + token }
        });

        if (result.status !== 200) {
          const raw = await FileSystem.readAsStringAsync(result.uri);
          let message = 'Invoice download failed.';
          try { message = JSON.parse(raw).error || message; } catch (_) {}
          throw new Error(message);
        }

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(result.uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Download or save your invoice'
          });
        } else {
          Alert.alert('Invoice saved', 'Invoice PDF saved to the app cache.');
        }
      }
    } catch (error) {
      console.log('Invoice download failed:', error.message);
      Alert.alert('Invoice unavailable', error.message || 'Could not download invoice PDF.');
    }
  };


  useEffect(() => {
    let cancelled = false;

    const loadUnlockedCourses = async () => {
      const user = auth.currentUser;

      if (!user) {
        setUnlockedCourses({});
        return;
      }

      try {
        const idToken = await user.getIdToken();
        const response = await fetch(['https:', '', 'study-with-veer-payment-backend.onrender.com', 'my-courses'].join('/'), {
          headers: { Authorization: 'Bearer ' + idToken }
        });

        const data = await response.json();

        if (!cancelled && response.ok) {
          setUnlockedCourses(data.courses || {});
        } else if (!response.ok) {
          console.log('Course access load failed:', data.error || response.status);
        }
      } catch (error) {
        console.log('Could not load course access:', error.message);
      }
    };

    if (loggedIn) {
      loadUnlockedCourses();
    } else {
      setUnlockedCourses({});
    }

    return () => { cancelled = true; };
  }, [loggedIn]);

  useEffect(() => {
    let paymentReturnSubscription;

    const refreshCourses = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const idToken = await user.getIdToken();
        const response = await fetch(['https:', '', 'study-with-veer-payment-backend.onrender.com', 'my-courses'].join('/'), {
          headers: { Authorization: 'Bearer ' + idToken }
        });
        const data = await response.json();

        if (response.ok) {
          setUnlockedCourses(data.courses || {});
        } else {
          console.log('Course refresh failed:', data.error || response.status);
        }
      } catch (error) {
        console.log('Course refresh error:', error.message);
      }
    };

    paymentReturnSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && loggedIn) {
        refreshCourses();
      }
    });

    return () => paymentReturnSubscription?.remove();
  }, [loggedIn]);

  const [resultsUserUid, setResultsUserUid] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, async user => {
      setResults([]);
      setResultsUserUid(null);

      if (!user) return;

      try {
        const key = 'veer_prep_results_' + user.uid;
        const saved = await AsyncStorage.getItem(key);

        if (!cancelled && auth.currentUser?.uid === user.uid) {
          setResults(saved ? JSON.parse(saved) : []);
          setResultsUserUid(user.uid);
        }
      } catch (error) {
        console.log('Could not load saved results:', error);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!resultsUserUid || auth.currentUser?.uid !== resultsUserUid) return;

    AsyncStorage.setItem(
      'veer_prep_results_' + resultsUserUid,
      JSON.stringify(results)
    ).catch(error => console.log('Could not save results:', error));
  }, [results, resultsUserUid]);

  const questionBank = {
    'Mathematics': [
      {q:'12 × 8 = ?',options:['86','96','108','88'],answer:1,explanation:'Method 1: Multiplication\nతెలుగు వివరణ: 12ని 8తో గుణిస్తే 96 వస్తుంది.\nShortcut: 10 × 8 = 80, 2 × 8 = 16; మొత్తం 96.'},
      {q:'25% of 200 = ?',options:['25','40','50','75'],answer:2,explanation:'Method 1: Percentage Formula\nతెలుగు వివరణ: 200 × 25 ÷ 100 = 50.\nMethod 2: Fraction Shortcut\nతెలుగు వివరణ: 25% అంటే నాలుగో వంతు. 200లో నాలుగో వంతు 50.'},
      {q:'If x + 7 = 15, find x.',options:['6','7','8','9'],answer:2,explanation:'Method 1: Subtraction\nతెలుగు వివరణ: x + 7 = 15 కాబట్టి 15 నుంచి 7 తీసేస్తే x = 8.'},
      {q:'Simple interest on ₹1000 at 10% for 2 years?',options:['₹100','₹150','₹200','₹250'],answer:2,explanation:'Formula: Simple Interest\nతెలుగు వివరణ: అసలు ₹1000, వడ్డీ రేటు 10%, కాలం 2 సంవత్సరాలు. 1000 × 10 × 2 ÷ 100 = ₹200.'},
      {q:'Average of 10, 20 and 30?',options:['15','20','25','30'],answer:1,explanation:'Formula: Average = Sum ÷ Count\nతెలుగు వివరణ: మూడు సంఖ్యల మొత్తం 60. సంఖ్యల సంఖ్య 3. కాబట్టి 60 ÷ 3 = 20.'}
    ],
    'Reasoning': [
      {q:'2, 4, 8, 16, ?',options:['18','24','32','36'],answer:2,explanation:'Pattern: Multiply by 2\nతెలుగు వివరణ: 2, 4, 8, 16 ప్రతి సంఖ్య రెండింతలు అవుతోంది. 16 × 2 = 32.\nShortcut: వరుస సంఖ్యల మధ్య సంబంధాన్ని గమనించండి.'},
      {q:'Find the odd one out.',options:['Apple','Mango','Carrot','Banana'],answer:2,explanation:'తెలుగు వివరణ: Apple, Mango, Banana పండ్లు. Carrot కూరగాయ. కాబట్టి Carrot భిన్నమైనది.\nExam Tip: వస్తువుల వర్గాన్ని గుర్తించండి.'},
      {q:'If CAT becomes DBU, DOG becomes?',options:['EPH','EOG','DPH','FPI'],answer:0,explanation:'Pattern: +1 Letter\nతెలుగు వివరణ: CAT లో C→D, A→B, T→U. అదే విధంగా DOG → EPH.'},
      {q:'A, C, E, G, ?',options:['H','I','J','K'],answer:1,explanation:'Pattern: Skip One Letter\nతెలుగు వివరణ: A, C, E, G లో ప్రతి సారి ఒక అక్షరం దాటుతున్నారు. కాబట్టి తర్వాత I.'},
      {q:'How many sides does a hexagon have?',options:['5','6','7','8'],answer:1,explanation:'తెలుగు వివరణ: Hexagon అంటే ఆరు భుజాలు ఉన్న ఆకారం.\nMemory Trick: Hexa = 6.'}
    ],
    'English': [
      {q:'Synonym of Rapid:',options:['Slow','Fast','Weak','Late'],answer:1,explanation:'Rule: Synonyms\nతెలుగు వివరణ: Rapid అంటే వేగంగా. Fast కూడా అదే అర్థాన్ని ఇస్తుంది.'},
      {q:'Antonym of Ancient:',options:['Old','Historic','Modern','Past'],answer:2,explanation:'Rule: Antonyms\nతెలుగు వివరణ: Ancient అంటే ప్రాచీనమైనది; Modern అంటే ఆధునికమైనది. ఇవి వ్యతిరేక అర్థాలు.'},
      {q:'Choose the correct spelling.',options:['Necesary','Necessary','Neccessary','Necessery'],answer:1,explanation:'తెలుగు వివరణ: సరైన spelling Necessary. ఇందులో ఒక C, రెండు S అక్షరాలు ఉంటాయి.\nMemory Trick: ne-C-essary.'},
      {q:'She ___ to school every day.',options:['go','going','goes','gone'],answer:2,explanation:'Rule: Simple Present Tense\nతెలుగు వివరణ: He, She, It వచ్చినప్పుడు సాధారణంగా verb కి s/es జతచేస్తాం. అందుకే goes సరైనది.'},
      {q:'Plural of Child:',options:['Childs','Childes','Children','Childrens'],answer:2,explanation:'Rule: Irregular Plural\nతెలుగు వివరణ: Child యొక్క plural రూపం Children. దీనికి సాధారణంగా s జతచేయము.'}
    ],
    'General Knowledge': [
      {q:'Capital of India:',options:['Mumbai','Chennai','New Delhi','Kolkata'],answer:2,explanation:'తెలుగు వివరణ: భారతదేశ రాజధాని New Delhi.\nMemory Trick: India → New Delhi.'},
      {q:'Who wrote the Indian national anthem?',options:['Mahatma Gandhi','Rabindranath Tagore','B. R. Ambedkar','Subhas Chandra Bose'],answer:1,explanation:'తెలుగు వివరణ: భారత జాతీయ గీతం Jana Gana Mana రచయిత Rabindranath Tagore.\nMemory Trick: National Anthem → Tagore.'},
      {q:'Which is the Red Planet?',options:['Venus','Mars','Jupiter','Mercury'],answer:1,explanation:'తెలుగు వివరణ: Mars ఎర్రగా కనిపించడం వల్ల దీనిని Red Planet అంటారు.\nMemory Trick: Red Planet → Mars.'},
      {q:'How many houses are in the Indian Parliament?',options:['One','Two','Three','Four'],answer:1,explanation:'తెలుగు వివరణ: భారత పార్లమెంట్‌లో రెండు సభలు ఉన్నాయి: Lok Sabha, Rajya Sabha.\nMemory Trick: Parliament = 2 Houses.'},
      {q:'Largest ocean:',options:['Atlantic','Indian','Arctic','Pacific'],answer:3,explanation:'తెలుగు వివరణ: Pacific Ocean ప్రపంచంలోనే అతిపెద్ద మహాసముద్రం.\nMemory Trick: Largest Ocean → Pacific.'}
    ]
  };
  const quantTopics = [
    'Number System','Simplification','Percentage','Ratio & Proportion',
    'Average','Profit & Loss','Discount','Simple Interest',
    'Compound Interest','Time & Work','Pipes & Cisterns',
    'Time, Speed & Distance','Algebra','Geometry','Mensuration',
    'Trigonometry','Statistics','Data Interpretation'
  ];

  const quantBank = {
    'Reasoning: Analogy': [
      {q:'Book is to Reading as Fork is to ____.',options:['Drawing','Writing','Eating','Sleeping'],answer:2,explanation:'English: A book is used for reading; a fork is used for eating. Telugu: పుస్తకాన్ని చదవడానికి, ఫోర్క్‌ను తినడానికి ఉపయోగిస్తారు.'},
      {q:'Bird : Nest :: Bee : ?',options:['Cave','Hive','Stable','Web'],answer:1,explanation:'English: A nest is a bird’s home; a hive is a bee’s home. Telugu: పక్షి గూడు లో ఉంటుంది; తేనెటీగ తేనెపెట్టెలో ఉంటుంది.'},
      {q:'Doctor : Hospital :: Teacher : ?',options:['Court','School','Farm','Bank'],answer:1,explanation:'English: A doctor commonly works in a hospital; a teacher works in a school. Telugu: వైద్యుడు ఆసుపత్రిలో, ఉపాధ్యాయుడు పాఠశాలలో పనిచేస్తారు.'},
      {q:'Puppy : Dog :: Kitten : ?',options:['Cow','Cat','Goat','Horse'],answer:1,explanation:'English: Puppy is a young dog; kitten is a young cat. Telugu: Puppy అంటే కుక్క పిల్ల; Kitten అంటే పిల్లి పిల్ల.'},
      {q:'2 : 4 :: 5 : ?',options:['10','15','20','25'],answer:0,explanation:'English: The second number is twice the first: 2×2=4, so 5×2=10. Telugu: రెండో సంఖ్య మొదటి సంఖ్యకు రెండింతలు. 5×2=10.'},
      {q:'Hand : Glove :: Foot : ?',options:['Cap','Sock','Shirt','Belt'],answer:1,explanation:'English: A glove covers a hand; a sock covers a foot. Telugu: గ్లౌవ్ చేతికి, సాక్ పాదానికి ధరిస్తారు.'},
      {q:'India : Rupee :: Japan : ?',options:['Dollar','Euro','Yen','Pound'],answer:2,explanation:'English: Rupee is India’s currency; Yen is Japan’s currency. Telugu: భారత కరెన్సీ రూపాయి; జపాన్ కరెన్సీ యెన్.'},
      {q:'Eye : See :: Ear : ?',options:['Smell','Hear','Taste','Touch'],answer:1,explanation:'English: Eyes are used to see; ears are used to hear. Telugu: కళ్లతో చూస్తాం; చెవులతో వింటాం.'},
      {q:'Monday : Tuesday :: Friday : ?',options:['Thursday','Saturday','Sunday','Wednesday'],answer:1,explanation:'English: Tuesday follows Monday; Saturday follows Friday. Telugu: సోమవారం తర్వాత మంగళవారం; శుక్రవారం తర్వాత శనివారం.'},
      {q:'Triangle : 3 :: Pentagon : ?',options:['4','5','6','8'],answer:1,explanation:'English: A triangle has 3 sides; a pentagon has 5 sides. Telugu: త్రిభుజానికి 3 భుజాలు; పంచభుజానికి 5 భుజాలు.'}
    ],
    'Number System': [
      {q:'Which is the smallest prime number?',options:['0','1','2','3'],answer:2,explanation:"Concept: A prime number has exactly two factors: 1 and itself.\nRule: 1 is not prime. The smallest prime is 2.\nCheck: Factors of 2 are 1 and 2. So it has exactly two factors.\nShortcut: 2 is the only even prime number.\nతెలుగు: ప్రధాన సంఖ్యకు 1 మరియు అదే సంఖ్య అనే రెండు కారణాంకాలు మాత్రమే ఉంటాయి. అతి చిన్న ప్రధాన సంఖ్య 2."},
      {q:'Which of these is a natural number?',options:['-3','0.5','7','-1'],answer:2,explanation:"Concept: Natural numbers are counting numbers.\nFormula / Rule: N = {1, 2, 3, 4, ...}\nCheck options: -3 and -1 are negative; 0.5 is a fraction; 7 is a positive counting number.\nAnswer: 7.\nతెలుగు: లెక్కించడానికి ఉపయోగించే 1, 2, 3, 4... సహజ సంఖ్యలు. ఇచ్చిన వాటిలో 7 సరైనది."},
      {q:'What is the HCF of 12 and 18?',options:['2','3','6','9'],answer:2,explanation:"Concept: HCF is the greatest number that divides both numbers exactly.\nMethod 1 — Factors:\n12: 1, 2, 3, 4, 6, 12\n18: 1, 2, 3, 6, 9, 18\nCommon factors: 1, 2, 3, 6. Greatest = 6.\nFormula: HCF × LCM = Product of the two numbers.\nతెలుగు: రెండు సంఖ్యలను శేషం లేకుండా భాగించే సాధారణ కారణాంకాలలో అతి పెద్దది HCF. కాబట్టి సమాధానం 6."},
      {q:'What is the LCM of 4 and 6?',options:['8','10','12','24'],answer:2,explanation:"Concept: LCM is the smallest positive number divisible by both numbers.\nMultiples of 4: 4, 8, 12, 16, ...\nMultiples of 6: 6, 12, 18, ...\nFirst common multiple = 12.\nFormula: LCM = (First number × Second number) ÷ HCF.\nCalculation: (4 × 6) ÷ 2 = 12.\nతెలుగు: 4 మరియు 6 రెండింటితో శేషం లేకుండా భాగించబడే అతి చిన్న సంఖ్య 12."},
      {q:'Which number is divisible by 3?',options:['124','235','417','502'],answer:2,explanation:"Rule: A number is divisible by 3 if the sum of its digits is divisible by 3.\nOption C: 417 → 4 + 1 + 7 = 12.\nCheck: 12 ÷ 3 = 4, with no remainder.\nOther options: 124 → 7; 235 → 10; 502 → 7. These digit sums are not divisible by 3.\nShortcut: Add the digits instead of dividing the entire number.\nతెలుగు: అంకెల మొత్తాన్ని 3తో భాగించగలిగితే ఆ సంఖ్య కూడా 3తో భాగించబడుతుంది. 417 అంకెల మొత్తం 12."},
      {q:'What is the remainder when 29 is divided by 5?',options:['2','3','4','5'],answer:2,explanation:"Concept: Dividend = Divisor × Quotient + Remainder.\nFormula: Remainder = Dividend − (Divisor × Quotient).\nStep 1: 29 ÷ 5 gives quotient 5.\nStep 2: 5 × 5 = 25.\nStep 3: Remainder = 29 − 25 = 4.\nCorrect answer: Option C (4).\nతెలుగు: 29లో 5ను ఐదు సార్లు తీస్తే 25. మిగిలిన 29 − 25 = 4. కాబట్టి శేషం 4."},
      {q:'Which of these is an even number?',options:['17','23','36','41'],answer:2,explanation:"Concept: An even integer is exactly divisible by 2.\nRule: Even number = 2 × an integer.\nCheck: 36 ÷ 2 = 18, remainder 0.\nThe other options 17, 23 and 41 are odd numbers.\nShortcut: Whole numbers ending in 0, 2, 4, 6 or 8 are even.\nతెలుగు: 2తో శేషం లేకుండా భాగించబడే పూర్ణసంఖ్య సరి సంఖ్య. 36 సరి సంఖ్య."},
      {q:'What is the square of 15?',options:['125','200','225','250'],answer:2,explanation:"Concept: The square of a number is the number multiplied by itself.\nFormula: n² = n × n.\nMethod 1: 15² = 15 × 15 = 225.\nShortcut: (a + b)² = a² + 2ab + b².\nApply: 15² = (10 + 5)² = 100 + 100 + 25 = 225.\nతెలుగు: ఒక సంఖ్యను అదే సంఖ్యతో గుణిస్తే వర్గం వస్తుంది. 15² = 225."},
      {q:'Which is the greatest number?',options:['0.7','0.07','0.77','0.707'],answer:2,explanation:"Concept: Write decimals with the same number of decimal places.\n0.7 = 0.700; 0.07 = 0.070; 0.77 = 0.770; 0.707 = 0.707.\nCompare: 0.770 is greater than 0.707, 0.700 and 0.070.\nAnswer: 0.77.\nShortcut: Add zeros to the right of decimals; the value does not change.\nతెలుగు: దశాంశ స్థానాలను సమానంగా రాసి పోల్చాలి. 0.770 అన్నింటికంటే పెద్దది."},
      {q:'What is 2³ × 2²?',options:['16','24','32','64'],answer:2,explanation:"Concept: When multiplying powers with the same base, add their exponents.\nFormula: aᵐ × aⁿ = aᵐ⁺ⁿ.\nStep 1: 2³ × 2² = 2⁽³⁺²⁾ = 2⁵.\nStep 2: 2⁵ = 2 × 2 × 2 × 2 × 2 = 32.\nAdvanced rule: aᵐ ÷ aⁿ = aᵐ⁻ⁿ, for a non-zero base.\nతెలుగు: ఒకే ఆధారం ఉన్న ఘాతాలను గుణించినప్పుడు ఘాతాలను కలపాలి. 3 + 2 = 5; 2⁵ = 32."}
    ],
    'Percentage': [
      {q:'25% of 240 = ?',options:['40','50','60','80'],answer:2,explanation:"Concept: Percent means per hundred.\nFormula: x% of N = (x ÷ 100) × N.\nMethod 1: 25% of 240 = 25/100 × 240 = 60.\nShortcut: 25% = 1/4. So 240 ÷ 4 = 60.\nతెలుగు: శాతాన్ని సంఖ్యతో గుణించి 100తో భాగించాలి. 25% అంటే నాలుగో వంతు; 240 ÷ 4 = 60."},
      {q:'40% of 350 = ?',options:['120','130','140','150'],answer:2,explanation:"Formula: x% of N = (x/100) × N.\nStep 1: 40% of 350 = 40/100 × 350.\nStep 2: 350 ÷ 10 = 35; 35 × 4 = 140.\nShortcut: 40% = 4/10, so 350 × 4 ÷ 10 = 140.\nతెలుగు: 350లో 10% = 35. కాబట్టి 40% = 35 × 4 = 140."},
      {q:'A number increases from 80 to 100. Percentage increase?',options:['20%','25%','30%','40%'],answer:1,explanation:"Formula: Percentage increase = (Increase ÷ Original value) × 100.\nStep 1: Increase = 100 − 80 = 20.\nStep 2: Percentage increase = (20 ÷ 80) × 100.\nStep 3: = 0.25 × 100 = 25%.\nImportant: Always divide by the original value, not the final value.\nతెలుగు: పెరుగుదల 20. అసలు సంఖ్య 80 కాబట్టి (20 ÷ 80) × 100 = 25%."},
      {q:'15% of 600 = ?',options:['60','75','90','120'],answer:2,explanation:"Formula: x% of N = (x/100) × N.\nMethod 1: 15/100 × 600 = 90.\nShortcut: 10% of 600 = 60; 5% = half of 10% = 30.\nTherefore 15% = 60 + 30 = 90.\nతెలుగు: 600లో 10% = 60; 5% = 30. రెండింటిని కలిపితే 15% = 90."},
      {q:'A student scores 360 out of 450. Percentage?',options:['70%','75%','80%','85%'],answer:2,explanation:"Formula: Percentage = (Obtained marks ÷ Total marks) × 100.\nStep 1: Percentage = (360 ÷ 450) × 100.\nStep 2: Simplify 360/450 = 36/45 = 4/5.\nStep 3: (4/5) × 100 = 80%.\nShortcut: Simplify the fraction before multiplying by 100.\nతెలుగు: వచ్చిన మార్కులను మొత్తం మార్కులతో భాగించి 100తో గుణించాలి. 360/450 = 4/5; శాతం 80%."},
      {q:'20% of a number is 50. Find the number.',options:['200','225','250','275'],answer:2,explanation:"Let the unknown number be x.\nFormula: (Percentage/100) × x = Given value.\nStep 1: (20/100) × x = 50.\nStep 2: x = 50 × 100/20.\nStep 3: x = 250.\nShortcut: If 20% = 50, then 10% = 25 and 100% = 25 × 10 = 250.\nతెలుగు: 20% విలువ 50 అయితే 10% విలువ 25. పూర్తి 100% విలువ 25 × 10 = 250."},
      {q:'A price of ₹500 is reduced by 10%. New price?',options:['₹400','₹450','₹475','₹490'],answer:1,explanation:"Formula: Discount = Marked price × Discount rate/100.\nStep 1: Discount = 500 × 10/100 = ₹50.\nStep 2: New price = Original price − Discount.\nStep 3: New price = 500 − 50 = ₹450.\nShortcut: After a 10% reduction, 90% of the original price remains.\nCheck: 500 × 90/100 = ₹450.\nతెలుగు: ₹500లో 10% తగ్గింపు ₹50. కొత్త ధర = 500 − 50 = ₹450."},
      {q:'What percentage of 80 is 20?',options:['20%','25%','30%','40%'],answer:1,explanation:"Formula: Percentage = (Part ÷ Whole) × 100.\nStep 1: Part = 20; Whole = 80.\nStep 2: Percentage = (20/80) × 100.\nStep 3: 20/80 = 1/4; 1/4 × 100 = 25%.\nShortcut: 20 is one-fourth of 80, and one-fourth equals 25%.\nతెలుగు: 80లో 20 నాలుగో వంతు. కాబట్టి శాతం 25%."},
      {q:'Population 2000 increases by 5%. New population?',options:['2050','2100','2150','2200'],answer:1,explanation:"Formula: Increase = Original value × Rate/100.\nStep 1: Increase = 2000 × 5/100 = 100.\nStep 2: New population = Original population + Increase.\nStep 3: 2000 + 100 = 2100.\nShortcut: For a 5% increase, multiply the original value by 1.05.\nCheck: 2000 × 1.05 = 2100.\nతెలుగు: 2000లో 5% పెరుగుదల 100. కొత్త జనాభా = 2000 + 100 = 2100."},
      {q:'A number decreases from 120 to 90. Percentage decrease?',options:['20%','25%','30%','35%'],answer:1,explanation:"Formula: Percentage decrease = (Decrease ÷ Original value) × 100.\nStep 1: Decrease = 120 − 90 = 30.\nStep 2: Percentage decrease = (30 ÷ 120) × 100.\nStep 3: 30/120 = 1/4; 1/4 × 100 = 25%.\nImportant: Use the original value (120) as the denominator.\nతెలుగు: తగ్గుదల 30. అసలు సంఖ్య 120. కాబట్టి (30 ÷ 120) × 100 = 25%."}
    ],
    "Simplification": [
      {
        "q": "Simplify: 18 + 6 ÷ 3 × 2",
        "options": [
          "16",
          "20",
          "22",
          "24"
        ],
        "answer": 2,
        "explanation": "Formula / Rule: BODMAS — division and multiplication before addition.\nStep 1: 6 ÷ 3 = 2.\nStep 2: 2 × 2 = 4.\nStep 3: 18 + 4 = 22. Correct option: C.\nతెలుగు: ముందుగా భాగహారం, గుణకారం; తర్వాత కూడిక. సమాధానం 22."
      },
      {
        "q": "Simplify: 3/4 + 1/8",
        "options": [
          "4/12",
          "5/8",
          "7/8",
          "1"
        ],
        "answer": 2,
        "explanation": "Formula: a/b + c/d = (ad + bc)/bd.\nStep 1: 3/4 = 6/8.\nStep 2: 6/8 + 1/8 = 7/8.\nతెలుగు: హారాలు సమానం చేయాలి. 3/4 = 6/8; మొత్తం 7/8."
      },
      {
        "q": "√144 + √25 = ?",
        "options": [
          "12",
          "15",
          "17",
          "19"
        ],
        "answer": 1,
        "explanation": "Rule: √a is the non-negative number whose square is a.\n√144 = 12 because 12² = 144.\n√25 = 5 because 5² = 25.\nTotal = 12 + 5 = 17. Correct option: C.\nతెలుగు: 144 వర్గమూలం 12; 25 వర్గమూలం 5. మొత్తం 17."
      }
    ,
      {q:"Simplify: 24 ÷ 6 × 3",options:["2","4","12","18"],answer:2,explanation:"Left to right: 24 ÷ 6 = 4; 4 × 3 = 12. తెలుగు: భాగహారం, గుణకారం ఒకే ప్రాధాన్యత; ఎడమ నుంచి కుడికి చేయాలి."},
      {q:"Simplify: 15 + 5 × 4",options:["80","35","60","20"],answer:1,explanation:"BODMAS: 5 × 4 = 20; 15 + 20 = 35. తెలుగు: ముందుగా గుణకారం చేయాలి."},
      {q:"Simplify: (18 − 6) ÷ 3",options:["2","3","4","6"],answer:2,explanation:"Bracket first: 18 − 6 = 12; 12 ÷ 3 = 4. తెలుగు: ముందుగా కుండలిలోని లెక్క."},
      {q:"Simplify: 7² − 5²",options:["12","24","14","49"],answer:1,explanation:"Squares: 49 − 25 = 24. తెలుగు: 7² = 49, 5² = 25; తేడా 24."},
      {q:"Simplify: 36 ÷ (3 × 4)",options:["3","9","12","6"],answer:0,explanation:"Bracket: 3 × 4 = 12; 36 ÷ 12 = 3. తెలుగు: ముందుగా కుండలిలో గుణించాలి."},
      {q:"Simplify: 8 + 24 ÷ 6",options:["12","5","4","16"],answer:0,explanation:"Division first: 24 ÷ 6 = 4; 8 + 4 = 12. తెలుగు: ముందుగా భాగహారం."},
      {q:"Simplify: 5 × (9 − 3) ÷ 2",options:["10","12","15","30"],answer:2,explanation:"Bracket: 9 − 3 = 6; 5 × 6 ÷ 2 = 15. తెలుగు: కుండలి తర్వాత గుణకారం, భాగహారం ఎడమ నుంచి కుడికి."}
    ],
    "Ratio & Proportion": [
      {
        "q": "Simplify the ratio 24:36.",
        "options": [
          "2:3",
          "3:2",
          "4:5",
          "6:9"
        ],
        "answer": 0,
        "explanation": "Formula: Divide both terms by their HCF.\nHCF(24,36) = 12.\n24:36 = (24÷12):(36÷12) = 2:3.\nతెలుగు: రెండు భాగాలను 12తో భాగిస్తే సరళ నిష్పత్తి 2:3."
      },
      {
        "q": "If 5 pens cost ₹60, what is the cost of 8 pens at the same rate?",
        "options": [
          "₹84",
          "₹90",
          "₹96",
          "₹100"
        ],
        "answer": 2,
        "explanation": "Formula: Unit cost = Total cost ÷ Quantity.\nOne pen = ₹60 ÷ 5 = ₹12.\nEight pens = 8 × ₹12 = ₹96.\nతెలుగు: ఒక పెన్ను ధర ₹12. ఎనిమిది పెన్నుల ధర 8 × 12 = ₹96."
      },
      {
        "q": "Divide ₹720 in the ratio 5:7. What is the smaller share?",
        "options": [
          "₹250",
          "₹300",
          "₹350",
          "₹420"
        ],
        "answer": 1,
        "explanation": "Formula: Share = Total × Required ratio part ÷ Sum of ratio parts.\nRatio total = 5 + 7 = 12.\nSmaller share = 720 × 5/12 = ₹300.\nతెలుగు: మొత్తం భాగాలు 12. చిన్న వాటా = 720 × 5/12 = ₹300."
      }
    ,
      {q:"Simplify the ratio 24:36",options:["2:3","3:2","4:5","3:4"],answer:0,explanation:"Divide both terms by HCF 12: 24:36 = 2:3. తెలుగు: రెండు సంఖ్యలను 12తో భాగించాలి."},
      {q:"If 3:5 = x:20, find x.",options:["10","12","15","18"],answer:1,explanation:"3/5 = x/20; x = 3 × 20 ÷ 5 = 12. తెలుగు: క్రాస్ గుణకారం చేస్తే x = 12."},
      {q:"Divide ₹640 in ratio 3:5. Find the first share.",options:["₹240","₹300","₹400","₹160"],answer:0,explanation:"Total parts = 8; first share = 640 × 3/8 = ₹240. తెలుగు: మొత్తం భాగాలు 3+5 = 8."},
      {q:"If a:b = 4:7 and b = 35, find a.",options:["15","20","25","28"],answer:1,explanation:"7 parts = 35, so 1 part = 5; a = 4 × 5 = 20. తెలుగు: ఒక్క భాగం విలువ 5."},
      {q:"Two numbers are in ratio 2:3 and their sum is 45. Find the smaller.",options:["15","18","20","27"],answer:1,explanation:"Total parts = 5; one part = 45/5 = 9; smaller = 2 × 9 = 18. తెలుగు: చిన్న సంఖ్య 18."},
      {q:"If 5 pens cost ₹60, what is the cost of 8 pens?",options:["₹84","₹90","₹96","₹100"],answer:2,explanation:"One pen = 60/5 = ₹12; 8 pens = 8 × 12 = ₹96. తెలుగు: ఒక్క పెన్ను ₹12."},
      {q:"Find the fourth proportional to 4, 6, 8.",options:["10","12","14","16"],answer:1,explanation:"4:6 = 8:x; x = 6 × 8/4 = 12. తెలుగు: నాలుగో అనుపాతం 12."}
    ],
    "Average": [
      {
        "q": "Find the average of 12, 18, 20 and 10.",
        "options": [
          "12",
          "14",
          "15",
          "16"
        ],
        "answer": 2,
        "explanation": "Formula: Average = Sum of observations ÷ Number of observations.\nSum = 12 + 18 + 20 + 10 = 60.\nAverage = 60 ÷ 4 = 15.\nతెలుగు: మొత్తం 60; సంఖ్యలు 4. సగటు 60 ÷ 4 = 15."
      },
      {
        "q": "The average of 5 numbers is 18. Find their total.",
        "options": [
          "80",
          "85",
          "90",
          "95"
        ],
        "answer": 2,
        "explanation": "Formula: Total = Average × Number of observations.\nTotal = 18 × 5 = 90.\nతెలుగు: మొత్తం = సగటు × సంఖ్యల సంఖ్య = 18 × 5 = 90."
      },
      {
        "q": "The average of 4 numbers is 16. If 20 is added, what is the new average?",
        "options": [
          "16",
          "16.8",
          "17",
          "18"
        ],
        "answer": 1,
        "explanation": "Original total = 4 × 16 = 64.\nNew total = 64 + 20 = 84.\nNew count = 5.\nNew average = 84 ÷ 5 = 16.8.\nతెలుగు: పాత మొత్తం 64. కొత్త మొత్తం 84; 5 సంఖ్యల సగటు 16.8."
      }
    ,
      {q:"Find the average of 12, 18 and 24.",options:["16","18","20","22"],answer:1,explanation:"Average = sum/count = (12+18+24)/3 = 54/3 = 18. తెలుగు: మొత్తం 54; సంఖ్యలు 3."},
      {q:"Average of 5 numbers is 16. Find their sum.",options:["64","70","75","80"],answer:3,explanation:"Sum = average × count = 16 × 5 = 80. తెలుగు: మొత్తం = సగటు × సంఖ్యల సంఖ్య."},
      {q:"Average of 10 and 20 is:",options:["12","15","18","30"],answer:1,explanation:"Average = (10+20)/2 = 15. తెలుగు: మొత్తం 30ను 2తో భాగించాలి."},
      {q:"Average of 6 numbers is 14. If 20 is added, find the new average.",options:["14","14 6/7","15","16"],answer:1,explanation:"Old sum = 6×14 = 84; new sum = 104; average = 104/7 = 14 6/7. తెలుగు: కొత్త మొత్తాన్ని 7తో భాగించాలి."},
      {q:"Average of 4 numbers is 25. If one number 31 is removed, find the average of the remaining numbers.",options:["21","23","24","25"],answer:1,explanation:"Total = 4×25 = 100; remaining sum = 100−31 = 69; average = 69/3 = 23. తెలుగు: మిగిలిన మొత్తం 69."},
      {q:"Average of 8 numbers is 12. If each increases by 3, what is the new average?",options:["12","13","15","24"],answer:2,explanation:"When every value rises by 3, average also rises by 3: 12+3 = 15. తెలుగు: సగటు కూడా 3 పెరుగుతుంది."},
      {q:"Average of 7 consecutive integers is 18. Find the middle integer.",options:["16","17","18","19"],answer:2,explanation:"For an odd count of consecutive integers, average equals the middle integer. తెలుగు: మధ్య సంఖ్య 18."}
    ],
    "Profit & Loss": [
      {
        "q": "An article costs ₹800 and is sold for ₹920. Find the profit percentage.",
        "options": [
          "10%",
          "12%",
          "15%",
          "20%"
        ],
        "answer": 2,
        "explanation": "Formula: Profit = SP − CP; Profit% = Profit/CP × 100.\nProfit = 920 − 800 = ₹120.\nProfit% = 120/800 × 100 = 15%.\nతెలుగు: లాభం ₹120. లాభ శాతం = 120/800 × 100 = 15%."
      },
      {
        "q": "An item bought for ₹500 is sold at a loss of 10%. Find the selling price.",
        "options": [
          "₹400",
          "₹450",
          "₹475",
          "₹550"
        ],
        "answer": 1,
        "explanation": "Formula: SP = CP × (100 − Loss%)/100.\nSP = 500 × 90/100 = ₹450.\nతెలుగు: 10% నష్టం తర్వాత ధర అసలు ధరలో 90%. 500 × 0.9 = ₹450."
      },
      {
        "q": "An item is sold for ₹660 at a profit of 10%. Find its cost price.",
        "options": [
          "₹580",
          "₹600",
          "₹620",
          "₹630"
        ],
        "answer": 1,
        "explanation": "Formula: CP = SP × 100/(100 + Profit%).\nCP = 660 × 100/110 = ₹600.\nCheck: 10% of 600 = 60; 600 + 60 = 660.\nతెలుగు: 110% విలువ ₹660 అయితే 100% విలువ ₹600."
      }
    ,
      {q:"Cost price ₹500, selling price ₹600. Find profit percentage.",options:["10%","15%","20%","25%"],answer:2,explanation:"Profit = 600−500 = ₹100; profit% = 100/500×100 = 20%. తెలుగు: లాభ శాతం అసలు ధర ఆధారంగా."},
      {q:"An article bought for ₹800 is sold at 10% loss. Find selling price.",options:["₹700","₹720","₹740","₹780"],answer:1,explanation:"Loss = 10% of 800 = ₹80; SP = 800−80 = ₹720. తెలుగు: అమ్మకపు ధర ₹720."},
      {q:"An article is sold for ₹450 at 25% profit. Find cost price.",options:["₹300","₹340","₹360","₹400"],answer:2,explanation:"SP = 125% of CP; CP = 450×100/125 = ₹360. తెలుగు: CP = SP×100/125."},
      {q:"Cost price ₹1,200 and loss ₹150. Find loss percentage.",options:["10%","12.5%","15%","20%"],answer:1,explanation:"Loss% = 150/1200×100 = 12.5%. తెలుగు: నష్టం ÷ అసలు ధర × 100."},
      {q:"An article costs ₹250 and is sold for ₹300. Find profit.",options:["₹25","₹40","₹50","₹60"],answer:2,explanation:"Profit = SP−CP = 300−250 = ₹50. తెలుగు: అమ్మకపు ధర నుంచి కొనుగోలు ధర తీసివేయాలి."},
      {q:"A shopkeeper sells an item for ₹960 at 20% profit. Find CP.",options:["₹720","₹768","₹800","₹840"],answer:2,explanation:"SP = 120% of CP; CP = 960×100/120 = ₹800. తెలుగు: కొనుగోలు ధర ₹800."},
      {q:"An article bought for ₹400 is sold for ₹340. Find loss percentage.",options:["10%","12%","15%","20%"],answer:2,explanation:"Loss = 400−340 = ₹60; loss% = 60/400×100 = 15%. తెలుగు: నష్టం ₹60, శాతం 15%."}
    ],
    "Discount": [
      {
        "q": "Marked price is ₹1,000 and discount is 15%. Find selling price.",
        "options": [
          "₹800",
          "₹825",
          "₹850",
          "₹900"
        ],
        "answer": 2,
        "explanation": "Formula: Discount = MP × rate/100.\nDiscount = 1000 × 15/100 = ₹150.\nSelling price = 1000 − 150 = ₹850.\nతెలుగు: తగ్గింపు ₹150. అమ్మకపు ధర ₹850."
      },
      {
        "q": "A ₹2,000 item is sold for ₹1,700. Find the discount percentage.",
        "options": [
          "10%",
          "12%",
          "15%",
          "20%"
        ],
        "answer": 2,
        "explanation": "Discount = 2000 − 1700 = ₹300.\nFormula: Discount% = Discount/Marked price × 100.\n= 300/2000 × 100 = 15%.\nతెలుగు: తగ్గింపు ₹300; శాతం = 300/2000 × 100 = 15%."
      },
      {
        "q": "After a 20% discount, an item costs ₹640. Find its marked price.",
        "options": [
          "₹720",
          "₹760",
          "₹800",
          "₹840"
        ],
        "answer": 2,
        "explanation": "After 20% discount, selling price is 80% of marked price.\nFormula: MP = SP × 100/(100 − discount%).\nMP = 640 × 100/80 = ₹800.\nతెలుగు: ₹640 అనేది మార్క్ ధరలో 80%. మార్క్ ధర ₹800."
      }
    ,
      {q:"Marked price ₹1,000, discount 10%. Find selling price.",options:["₹800","₹850","₹900","₹950"],answer:2,explanation:"Discount = 1000×10/100 = ₹100; SP = ₹900. తెలుగు: తగ్గింపు ₹100."},
      {q:"Marked price ₹800, selling price ₹680. Find discount percentage.",options:["10%","12%","15%","20%"],answer:2,explanation:"Discount = 800−680 = ₹120; discount% = 120/800×100 = 15%. తెలుగు: తగ్గింపు శాతం 15%."},
      {q:"A ₹1,500 item has a 20% discount. Find its sale price.",options:["₹1,000","₹1,100","₹1,200","₹1,250"],answer:2,explanation:"Discount = ₹300; sale price = 1500−300 = ₹1,200. తెలుగు: 20% తగ్గింపు ₹300."},
      {q:"After 25% discount, an item sells for ₹600. Find marked price.",options:["₹750","₹800","₹850","₹900"],answer:1,explanation:"SP = 75% of MP; MP = 600×100/75 = ₹800. తెలుగు: మార్క్ ధర ₹800."},
      {q:"Marked price ₹2,000 with successive discounts of 10% and 10%. Find final price.",options:["₹1,600","₹1,620","₹1,700","₹1,800"],answer:1,explanation:"After first discount: 2000×0.9 = 1800; second: 1800×0.9 = ₹1620. తెలుగు: వరుస తగ్గింపులను విడివిడిగా లెక్కించాలి."},
      {q:"A product marked ₹500 is sold at 8% discount. Find discount amount.",options:["₹20","₹30","₹40","₹50"],answer:2,explanation:"Discount = 500×8/100 = ₹40. తెలుగు: తగ్గింపు మొత్తం ₹40."},
      {q:"An item marked ₹1,200 is sold for ₹1,020. Find discount percentage.",options:["10%","12%","15%","18%"],answer:2,explanation:"Discount = 1200−1020 = ₹180; 180/1200×100 = 15%. తెలుగు: తగ్గింపు శాతం 15%."}
    ],
    "Simple Interest": [
      {
        "q": "Find SI on ₹2,000 at 5% per annum for 3 years.",
        "options": [
          "₹200",
          "₹250",
          "₹300",
          "₹350"
        ],
        "answer": 2,
        "explanation": "Formula: SI = P × R × T/100.\nSI = 2000 × 5 × 3/100 = ₹300.\nAmount = Principal + SI = ₹2,300.\nతెలుగు: అసలు ₹2000, రేటు 5%, కాలం 3 సంవత్సరాలు. వడ్డీ ₹300."
      },
      {
        "q": "SI is ₹240 on ₹1,200 for 2 years. Find the annual rate.",
        "options": [
          "8%",
          "10%",
          "12%",
          "15%"
        ],
        "answer": 1,
        "explanation": "Formula: R = SI × 100/(P × T).\nR = 240 × 100/(1200 × 2) = 10%.\nCorrect option: B.\nతెలుగు: రేటు = 240 × 100 ÷ 2400 = 10%."
      },
      {
        "q": "At 8% SI per annum, how long will ₹1,000 earn ₹240 interest?",
        "options": [
          "2 years",
          "2.5 years",
          "3 years",
          "4 years"
        ],
        "answer": 2,
        "explanation": "Formula: T = SI × 100/(P × R).\nT = 240 × 100/(1000 × 8) = 3 years.\nతెలుగు: కాలం = 24000/8000 = 3 సంవత్సరాలు."
      }
    ,
      {q:"Find SI on ₹2,000 at 5% per annum for 3 years.",options:["₹200","₹250","₹300","₹350"],answer:2,explanation:"SI = P×R×T/100 = 2000×5×3/100 = ₹300. తెలుగు: సాధారణ వడ్డీ సూత్రం PRT/100."},
      {q:"SI is ₹400 at 8% per annum for 2 years. Find principal.",options:["₹2,000","₹2,500","₹3,000","₹3,500"],answer:1,explanation:"P = SI×100/(R×T) = 400×100/(8×2) = ₹2,500. తెలుగు: అసలు = SI×100/(R×T)."},
      {q:"Find SI on ₹1,500 at 4% for 5 years.",options:["₹200","₹250","₹300","₹350"],answer:2,explanation:"SI = 1500×4×5/100 = ₹300. తెలుగు: వడ్డీ ₹300."},
      {q:"At 10% SI, how many years will ₹500 earn ₹150 interest?",options:["2","3","4","5"],answer:1,explanation:"T = SI×100/(P×R) = 150×100/(500×10) = 3 years. తెలుగు: కాలం 3 సంవత్సరాలు."},
      {q:"Find amount on ₹2,400 at 5% SI for 2 years.",options:["₹2,500","₹2,600","₹2,640","₹2,700"],answer:2,explanation:"SI = 2400×5×2/100 = ₹240; amount = 2400+240 = ₹2640. తెలుగు: మొత్తం = అసలు + వడ్డీ."},
      {q:"At 6% SI for 4 years, interest is ₹480. Find principal.",options:["₹1,500","₹2,000","₹2,500","₹3,000"],answer:1,explanation:"P = 480×100/(6×4) = ₹2,000. తెలుగు: అసలు మొత్తం ₹2,000."},
      {q:"Find SI on ₹3,500 at 4% for 2 years.",options:["₹240","₹260","₹280","₹300"],answer:2,explanation:"SI = 3500×4×2/100 = ₹280. తెలుగు: సాధారణ వడ్డీ ₹280."}
    ],
    "Compound Interest": [
      {
        "q": "Find the amount on ₹1,000 at 10% compound interest for 2 years, compounded annually.",
        "options": [
          "₹1,100",
          "₹1,200",
          "₹1,210",
          "₹1,220"
        ],
        "answer": 2,
        "explanation": "Formula: A = P(1 + R/100)^T.\nA = 1000(1.1)² = 1000 × 1.21 = ₹1,210.\nCI = A − P = ₹210.\nతెలుగు: మొదటి సంవత్సరం మొత్తం ₹1100. రెండో సంవత్సరం 10% వడ్డీతో మొత్తం ₹1210."
      },
      {
        "q": "Find compound interest on ₹2,000 at 5% per annum for 2 years.",
        "options": [
          "₹200",
          "₹205",
          "₹210",
          "₹220"
        ],
        "answer": 1,
        "explanation": "Formula: CI = P(1 + R/100)^T − P.\nAmount = 2000 × (1.05)² = ₹2,205.\nCI = 2205 − 2000 = ₹205.\nతెలుగు: రెండు సంవత్సరాల మొత్తం ₹2205. చక్రవడ్డీ ₹205."
      },
      {
        "q": "For ₹1,000 at 10% per annum for 2 years, what is CI − SI?",
        "options": [
          "₹5",
          "₹10",
          "₹15",
          "₹20"
        ],
        "answer": 1,
        "explanation": "For 2 years: CI − SI = P × (R/100)².\n= 1000 × (10/100)² = 1000 × 0.01 = ₹10.\nతెలుగు: రెండు సంవత్సరాలకు తేడా = 1000 × (10/100)² = ₹10."
      }
    ,
      {q:"Find CI on ₹1,000 at 10% per annum for 2 years, compounded annually.",options:["₹200","₹210","₹220","₹250"],answer:1,explanation:"Amount = 1000×1.1² = ₹1210; CI = 1210−1000 = ₹210. తెలుగు: CI = మొత్తం − అసలు."},
      {q:"Find amount on ₹2,000 at 5% CI for 1 year.",options:["₹2,050","₹2,100","₹2,150","₹2,200"],answer:0,explanation:"Amount = 2000×1.05 = ₹2100. తెలుగు: ఒక సంవత్సరానికి వడ్డీ ₹100, మొత్తం ₹2100."},
      {q:"Find CI on ₹4,000 at 10% for 2 years, annually compounded.",options:["₹800","₹820","₹840","₹880"],answer:1,explanation:"Amount = 4000×1.1² = ₹4840; CI = ₹840. తెలుగు: మొదటి సంవత్సరం ₹400, రెండో సంవత్సరం ₹440."},
      {q:"Find CI on ₹5,000 at 4% for 2 years, annually compounded.",options:["₹400","₹404","₹408","₹420"],answer:2,explanation:"Amount = 5000×1.04² = ₹5408; CI = ₹408. తెలుగు: చక్రవడ్డీ ₹408."},
      {q:"Find amount on ₹1,000 at 20% CI for 2 years.",options:["₹1,200","₹1,400","₹1,440","₹1,500"],answer:2,explanation:"Amount = 1000×1.2² = ₹1440. తెలుగు: మొత్తం ₹1440."},
      {q:"Find CI on ₹8,000 at 5% for 2 years, annually compounded.",options:["₹800","₹820","₹840","₹880"],answer:1,explanation:"Amount = 8000×1.05² = ₹8820; CI = ₹820. తెలుగు: చక్రవడ్డీ ₹820."},
      {q:"Find the difference between CI and SI on ₹1,000 at 10% for 2 years.",options:["₹5","₹10","₹15","₹20"],answer:1,explanation:"SI = ₹200; CI = ₹210; difference = ₹10. తెలుగు: 2 సంవత్సరాలకు తేడా ₹10."}
    ],
    "Time & Work": [
      {
        "q": "A can finish a job in 10 days. What fraction of the work does A complete in one day?",
        "options": [
          "1/5",
          "1/10",
          "1/20",
          "10"
        ],
        "answer": 1,
        "explanation": "Formula: One-day work = 1/Total days.\nA completes 1/10 of the work per day.\nతెలుగు: మొత్తం పనిని 1గా తీసుకుంటే ఒక రోజు పని 1/10."
      },
      {
        "q": "A completes a job in 12 days and B in 6 days. Working together, how many days are needed?",
        "options": [
          "3 days",
          "4 days",
          "6 days",
          "9 days"
        ],
        "answer": 1,
        "explanation": "A one-day work = 1/12; B one-day work = 1/6.\nTogether = 1/12 + 2/12 = 1/4 work per day.\nTime = 1 ÷ (1/4) = 4 days.\nతెలుగు: కలిసి రోజుకు 1/4 పని చేస్తారు. మొత్తం పని పూర్తవడానికి 4 రోజులు."
      },
      {
        "q": "A can do a job in 15 days and B in 10 days. How long together?",
        "options": [
          "5 days",
          "6 days",
          "8 days",
          "12 days"
        ],
        "answer": 1,
        "explanation": "Combined daily work = 1/15 + 1/10 = 2/30 + 3/30 = 1/6.\nTime = 1 ÷ (1/6) = 6 days.\nతెలుగు: రోజువారీ పని 1/6. కాబట్టి మొత్తం పని 6 రోజుల్లో పూర్తవుతుంది."
      }
    ,
      {q:"A can finish a job in 12 days. What fraction of the work does A complete in one day?",options:["1/6","1/10","1/12","1/15"],answer:2,explanation:"One-day work = 1/total days = 1/12. తెలుగు: రోజువారీ పని = 1/12."},
      {q:"A finishes work in 10 days and B in 15 days. How long together?",options:["5 days","6 days","8 days","12 days"],answer:1,explanation:"Combined rate = 1/10+1/15 = 1/6; time = 6 days. తెలుగు: రోజువారీ పనులను కలిపితే 1/6."},
      {q:"A does a job in 8 days. How many days for half the job at the same rate?",options:["2","3","4","6"],answer:2,explanation:"Half the work takes half the time: 8/2 = 4 days. తెలుగు: సగం పని చేయడానికి 4 రోజులు."},
      {q:"12 workers finish a job in 10 days. How many days will 6 workers take?",options:["5","10","15","20"],answer:3,explanation:"Workers × days is constant: 12×10 = 6×d; d = 20. తెలుగు: కార్మికులు సగం అయితే రోజులు రెట్టింపు."},
      {q:"A completes work in 20 days. What percentage is completed in 5 days?",options:["20%","25%","30%","40%"],answer:1,explanation:"Fraction = 5/20 = 1/4 = 25%. తెలుగు: 5 రోజుల్లో 25% పని."},
      {q:"A and B together finish a job in 6 days. If A alone takes 10 days, how long does B alone take?",options:["12 days","15 days","18 days","20 days"],answer:1,explanation:"B rate = 1/6−1/10 = 1/15; B takes 15 days. తెలుగు: B రోజువారీ పని 1/15."},
      {q:"15 workers complete work in 12 days. How many workers are needed to finish it in 9 days?",options:["18","20","22","25"],answer:1,explanation:"Workers×days = constant: 15×12 = w×9; w = 20. తెలుగు: అవసరమైన కార్మికులు 20."}
    ],
    "Pipes & Cisterns": [
      {
        "q": "A pipe fills a tank in 6 hours. What fraction does it fill in one hour?",
        "options": [
          "1/3",
          "1/4",
          "1/6",
          "1/12"
        ],
        "answer": 2,
        "explanation": "Formula: One-hour filling rate = 1/Total filling time.\nRate = 1/6 tank per hour.\nతెలుగు: 6 గంటల్లో పూర్తి ట్యాంక్ నిండితే ఒక గంటలో 1/6 నిండుతుంది."
      },
      {
        "q": "Pipe A fills a tank in 4 hours and B in 12 hours. Together, how long?",
        "options": [
          "2 hours",
          "3 hours",
          "4 hours",
          "6 hours"
        ],
        "answer": 1,
        "explanation": "Combined rate = 1/4 + 1/12 = 3/12 + 1/12 = 1/3 tank/hour.\nTime = 1 ÷ 1/3 = 3 hours.\nతెలుగు: రెండు పైపుల కలిపిన వేగం గంటకు 1/3 ట్యాంక్. సమయం 3 గంటలు."
      },
      {
        "q": "A pipe fills a tank in 5 hours; a leak empties it in 20 hours. If both operate, how long to fill the tank?",
        "options": [
          "4 hours",
          "6 hours",
          "6 hours 40 minutes",
          "8 hours"
        ],
        "answer": 2,
        "explanation": "Net rate = Filling rate − Emptying rate.\n= 1/5 − 1/20 = 4/20 − 1/20 = 3/20 tank/hour.\nTime = 1 ÷ 3/20 = 20/3 hours = 6 hours 40 minutes.\nతెలుగు: లీక్ తీసివేసిన తర్వాత గంటకు 3/20 ట్యాంక్ నిండుతుంది. సమయం 6 గంటల 40 నిమిషాలు."
      }
    ,
      {q:"A pipe fills a tank in 6 hours. What part does it fill in 1 hour?",options:["1/3","1/4","1/5","1/6"],answer:3,explanation:"One-hour work = 1/total time = 1/6. తెలుగు: గంటకు ట్యాంకులో 1/6 భాగం నిండుతుంది."},
      {q:"Pipe A fills a tank in 4 hours and B in 6 hours. How long together?",options:["2 hours","2.4 hours","3 hours","5 hours"],answer:1,explanation:"Rate = 1/4 + 1/6 = 5/12; time = 12/5 = 2.4 hours. తెలుగు: రెండు పైపుల పనివేగాలు కలపాలి."},
      {q:"A pipe fills a tank in 8 hours. What fraction remains after 3 hours?",options:["3/8","5/8","1/2","7/8"],answer:1,explanation:"Filled = 3/8; remaining = 1−3/8 = 5/8. తెలుగు: మిగిలిన భాగం 5/8."},
      {q:"A pipe fills a tank in 5 hours. A leak empties it in 10 hours. How long to fill with both open?",options:["5 hours","8 hours","10 hours","15 hours"],answer:2,explanation:"Net rate = 1/5−1/10 = 1/10 tank/hour; time = 10 hours. తెలుగు: లీక్ వేగాన్ని తీసివేయాలి."},
      {q:"Two pipes fill a tank in 12 and 18 hours. Find time together.",options:["6 hours","7.2 hours","8 hours","9 hours"],answer:1,explanation:"Rate = 1/12+1/18 = 5/36; time = 36/5 = 7.2 hours. తెలుగు: మొత్తం సమయం 7.2 గంటలు."},
      {q:"A pipe fills 3/5 of a tank in 6 hours. How long for the full tank?",options:["8 hours","9 hours","10 hours","12 hours"],answer:2,explanation:"Full time = 6 ÷ (3/5) = 10 hours. తెలుగు: 3/5 భాగానికి 6 గంటలు అయితే మొత్తం 10 గంటలు."},
      {q:"A pipe empties a full tank in 8 hours. What fraction does it empty in 2 hours?",options:["1/8","1/4","1/3","1/2"],answer:1,explanation:"Emptied fraction = 2/8 = 1/4. తెలుగు: 2 గంటల్లో 1/4 భాగం ఖాళీ అవుతుంది."}
    ],
    "Time, Speed & Distance": [
      {
        "q": "A vehicle travels 150 km in 3 hours. Find its average speed.",
        "options": [
          "40 km/h",
          "45 km/h",
          "50 km/h",
          "60 km/h"
        ],
        "answer": 2,
        "explanation": "Formula: Speed = Distance ÷ Time.\nSpeed = 150 ÷ 3 = 50 km/h.\nతెలుగు: వేగం = దూరం/సమయం = 150/3 = 50 కి.మీ./గం."
      },
      {
        "q": "Convert 72 km/h into metres per second.",
        "options": [
          "15 m/s",
          "18 m/s",
          "20 m/s",
          "25 m/s"
        ],
        "answer": 2,
        "explanation": "Formula: km/h to m/s: multiply by 5/18.\n72 × 5/18 = 4 × 5 = 20 m/s.\nతెలుగు: కి.మీ./గం నుంచి మీ./సెకనుకు మార్చడానికి 5/18తో గుణించాలి."
      },
      {
        "q": "A 120 m train passes a pole in 6 seconds. Find its speed.",
        "options": [
          "15 m/s",
          "20 m/s",
          "25 m/s",
          "30 m/s"
        ],
        "answer": 1,
        "explanation": "Formula: Speed = Distance ÷ Time.\nDistance to pass a pole = train length = 120 m.\nSpeed = 120 ÷ 6 = 20 m/s = 72 km/h.\nతెలుగు: స్తంభాన్ని దాటే దూరం రైలు పొడవు 120 మీటర్లు. వేగం 20 మీ./సెకను."
      }
    ,
      {q:"A car travels 150 km in 3 hours. Find its speed.",options:["40 km/h","45 km/h","50 km/h","60 km/h"],answer:2,explanation:"Speed = distance/time = 150/3 = 50 km/h. తెలుగు: వేగం = దూరం ÷ సమయం."},
      {q:"A train moves at 60 km/h for 2.5 hours. Find distance.",options:["120 km","140 km","150 km","180 km"],answer:2,explanation:"Distance = speed×time = 60×2.5 = 150 km. తెలుగు: దూరం = వేగం × సమయం."},
      {q:"Convert 72 km/h into m/s.",options:["15 m/s","18 m/s","20 m/s","25 m/s"],answer:2,explanation:"Multiply by 5/18: 72×5/18 = 20 m/s. తెలుగు: km/h నుంచి m/s కు 5/18తో గుణించాలి."},
      {q:"A person covers 240 km at 40 km/h. Find time.",options:["4 hours","5 hours","6 hours","8 hours"],answer:2,explanation:"Time = distance/speed = 240/40 = 6 hours. తెలుగు: సమయం = దూరం ÷ వేగం."},
      {q:"A 120 m train passes a pole in 6 seconds. Find speed.",options:["15 m/s","20 m/s","25 m/s","30 m/s"],answer:1,explanation:"Speed = 120/6 = 20 m/s. తెలుగు: స్తంభాన్ని దాటేటప్పుడు రైలు తన పొడవు దూరం ప్రయాణిస్తుంది."},
      {q:"A man walks at 5 km/h. How far does he walk in 36 minutes?",options:["2 km","3 km","4 km","5 km"],answer:1,explanation:"36 minutes = 0.6 hour; distance = 5×0.6 = 3 km. తెలుగు: 36 నిమిషాలు = 0.6 గంట."},
      {q:"Two cars move in opposite directions at 40 and 50 km/h. How far apart after 2 hours if they start together?",options:["90 km","160 km","180 km","200 km"],answer:2,explanation:"Relative speed = 40+50 = 90 km/h; distance apart = 90×2 = 180 km. తెలుగు: వ్యతిరేక దిశల్లో వేగాలు కలపాలి."}
    ],
    "Algebra": [
      {
        "q": "If 3x = 27, find x.",
        "options": [
          "6",
          "7",
          "8",
          "9"
        ],
        "answer": 3,
        "explanation": "Rule: Apply the same operation to both sides.\n3x = 27; divide both sides by 3.\nx = 27/3 = 9.\nతెలుగు: రెండు వైపులా 3తో భాగిస్తే x = 9."
      },
      {
        "q": "Expand (a + b)².",
        "options": [
          "a² + b²",
          "a² + 2ab + b²",
          "a² − 2ab + b²",
          "2a + 2b"
        ],
        "answer": 1,
        "explanation": "Formula: (a + b)² = a² + 2ab + b².\nReason: (a+b)(a+b) = a² + ab + ab + b².\nCombine middle terms: a² + 2ab + b².\nతెలుగు: (a+b)ను అదే దానితో గుణిస్తే a² + 2ab + b² వస్తుంది."
      },
      {
        "q": "If x + 5 = 2x − 3, find x.",
        "options": [
          "5",
          "6",
          "7",
          "8"
        ],
        "answer": 3,
        "explanation": "x + 5 = 2x − 3.\nSubtract x: 5 = x − 3.\nAdd 3: x = 8.\nCheck: 8 + 5 = 16 − 3 = 13.\nతెలుగు: xని ఒక వైపు ఉంచి స్థిర సంఖ్యలను మరో వైపు తీసుకెళ్తే x = 8."
      }
    ,
      {q:"Solve: x + 7 = 19.",options:["10","11","12","13"],answer:2,explanation:"x = 19−7 = 12. తెలుగు: 7ను కుడివైపుకు తీసుకెళ్తే తీసివేత అవుతుంది."},
      {q:"Solve: 3x = 27.",options:["6","8","9","12"],answer:2,explanation:"x = 27/3 = 9. తెలుగు: రెండు వైపులా 3తో భాగించాలి."},
      {q:"If x = 4, find 2x² + 3.",options:["19","27","32","35"],answer:1,explanation:"2×4²+3 = 2×16+3 = 35. తెలుగు: సరైన విలువ 35."},
      {q:"Factorise: x²−25.",options:["(x−5)²","(x+5)²","(x−5)(x+5)","x(x−25)"],answer:2,explanation:"Difference of squares: a²−b² = (a−b)(a+b). తెలుగు: x²−25 = (x−5)(x+5)."},
      {q:"Solve: 2x + 5 = 17.",options:["5","6","7","8"],answer:1,explanation:"2x = 12; x = 6. తెలుగు: ముందుగా 5 తీసివేసి, తర్వాత 2తో భాగించాలి."},
      {q:"Simplify: (a³ × a²) ÷ a.",options:["a²","a³","a⁴","a⁵"],answer:2,explanation:"Same base: a³×a² = a⁵; a⁵/a = a⁴. తెలుగు: గుణకారంలో ఘాతాలు కలపాలి; భాగహారంలో తీసివేయాలి."},
      {q:"If x+y = 12 and x−y = 4, find x.",options:["4","6","8","10"],answer:2,explanation:"Add equations: 2x = 16; x = 8. తెలుగు: రెండు సమీకరణాలను కలిపితే 2x = 16."}
    ],
    "Geometry": [
      {
        "q": "The sum of the interior angles of a triangle is:",
        "options": [
          "90°",
          "180°",
          "270°",
          "360°"
        ],
        "answer": 1,
        "explanation": "Formula: Triangle angle sum = 180°.\nతెలుగు: ఏ త్రిభుజంలోనైనా మూడు అంతర్గత కోణాల మొత్తం 180°."
      },
      {
        "q": "Each angle of an equilateral triangle is:",
        "options": [
          "45°",
          "60°",
          "90°",
          "120°"
        ],
        "answer": 1,
        "explanation": "An equilateral triangle has three equal angles.\nEach angle = 180° ÷ 3 = 60°.\nతెలుగు: మూడు కోణాలు సమానం. ఒక్కో కోణం 180°/3 = 60°."
      },
      {
        "q": "The radius of a circle is 7 cm. Find its diameter.",
        "options": [
          "7 cm",
          "14 cm",
          "21 cm",
          "49 cm"
        ],
        "answer": 1,
        "explanation": "Formula: Diameter = 2 × Radius.\nD = 2 × 7 = 14 cm.\nతెలుగు: వ్యాసం = 2 × వ్యాసార్థం = 14 సెం.మీ."
      }
    ,
      {q:"Find the sum of interior angles of a triangle.",options:["90°","180°","270°","360°"],answer:1,explanation:"Triangle angle sum = 180°. తెలుగు: త్రిభుజంలోని కోణాల మొత్తం 180°."},
      {q:"Each angle of an equilateral triangle is:",options:["45°","60°","90°","120°"],answer:1,explanation:"All three angles equal; 180°/3 = 60°. తెలుగు: ప్రతి కోణం 60°."},
      {q:"Find the complement of 35°.",options:["45°","55°","65°","145°"],answer:1,explanation:"Complement = 90°−35° = 55°. తెలుగు: పూరక కోణాల మొత్తం 90°."},
      {q:"Find the supplement of 125°.",options:["45°","55°","65°","75°"],answer:1,explanation:"Supplement = 180°−125° = 55°. తెలుగు: సంపూరక కోణాల మొత్తం 180°."},
      {q:"A triangle has angles 50° and 60°. Find the third angle.",options:["60°","70°","80°","90°"],answer:1,explanation:"Third angle = 180°−50°−60° = 70°. తెలుగు: మూడో కోణం 70°."},
      {q:"How many sides does a hexagon have?",options:["5","6","7","8"],answer:1,explanation:"A hexagon has 6 sides. తెలుగు: షడ్భుజికి 6 భుజాలు ఉంటాయి."},
      {q:"Find each exterior angle of a regular octagon.",options:["30°","40°","45°","60°"],answer:2,explanation:"Each exterior angle = 360°/8 = 45°. తెలుగు: సమ అష్టభుజి బాహ్య కోణం 45°."}
    ],
    "Mensuration": [
      {
        "q": "Find the area of a rectangle of length 12 cm and breadth 5 cm.",
        "options": [
          "17 cm²",
          "34 cm²",
          "60 cm²",
          "120 cm²"
        ],
        "answer": 2,
        "explanation": "Formula: Rectangle area = length × breadth.\nArea = 12 × 5 = 60 cm².\nతెలుగు: దీర్ఘచతురస్ర వైశాల్యం = పొడవు × వెడల్పు = 60 చ.సెం.మీ."
      },
      {
        "q": "Find the circumference of a circle of radius 7 cm. Use π = 22/7.",
        "options": [
          "22 cm",
          "44 cm",
          "49 cm",
          "154 cm"
        ],
        "answer": 1,
        "explanation": "Formula: Circumference = 2πr.\n= 2 × 22/7 × 7 = 44 cm.\nతెలుగు: వృత్త పరిధి = 2πr = 44 సెం.మీ."
      },
      {
        "q": "Find the volume of a cube with side 4 cm.",
        "options": [
          "16 cm³",
          "32 cm³",
          "48 cm³",
          "64 cm³"
        ],
        "answer": 3,
        "explanation": "Formula: Cube volume = side³.\nVolume = 4 × 4 × 4 = 64 cm³.\nతెలుగు: ఘనం ఘనపరిమాణం = భుజం³ = 4³ = 64 ఘ.సెం.మీ."
      }
    ,
      {q:"Find the area of a rectangle of length 12 cm and breadth 5 cm.",options:["17 cm²","34 cm²","60 cm²","120 cm²"],answer:2,explanation:"Area = length×breadth = 12×5 = 60 cm². తెలుగు: వైశాల్యం = పొడవు × వెడల్పు."},
      {q:"Find the perimeter of a square of side 8 cm.",options:["16 cm","24 cm","32 cm","64 cm"],answer:2,explanation:"Perimeter = 4×side = 4×8 = 32 cm. తెలుగు: చుట్టుకొలత = 4 × భుజం."},
      {q:"Find the area of a triangle with base 10 cm and height 6 cm.",options:["16 cm²","30 cm²","60 cm²","36 cm²"],answer:1,explanation:"Area = 1/2×base×height = 1/2×10×6 = 30 cm². తెలుగు: త్రిభుజ వైశాల్యం = 1/2 × భూమి × ఎత్తు."},
      {q:"Find the circumference of a circle of radius 7 cm. Use π = 22/7.",options:["22 cm","44 cm","49 cm","154 cm"],answer:1,explanation:"Circumference = 2πr = 2×22/7×7 = 44 cm. తెలుగు: వృత్త చుట్టుకొలత = 2πr."},
      {q:"Find the volume of a cube of side 4 cm.",options:["16 cm³","32 cm³","48 cm³","64 cm³"],answer:3,explanation:"Volume = side³ = 4³ = 64 cm³. తెలుగు: ఘనం ఘనపరిమాణం = భుజం³."},
      {q:"Find the area of a circle of radius 7 cm. Use π = 22/7.",options:["44 cm²","77 cm²","154 cm²","308 cm²"],answer:2,explanation:"Area = πr² = 22/7×7×7 = 154 cm². తెలుగు: వృత్త వైశాల్యం = πr²."},
      {q:"Find the volume of a cuboid of dimensions 5 cm, 4 cm and 3 cm.",options:["12 cm³","20 cm³","60 cm³","120 cm³"],answer:2,explanation:"Volume = l×b×h = 5×4×3 = 60 cm³. తెలుగు: ఘనాభం = పొడవు × వెడల్పు × ఎత్తు."}
    ],
    "Trigonometry": [
      {
        "q": "What is sin 30°?",
        "options": [
          "0",
          "1/2",
          "√3/2",
          "1"
        ],
        "answer": 1,
        "explanation": "Standard value: sin 30° = 1/2.\nIn a right triangle, sin θ = Opposite side/Hypotenuse.\nతెలుగు: sin θ = ఎదురుభుజం/కర్ణం. sin 30° విలువ 1/2."
      },
      {
        "q": "What is tan 45°?",
        "options": [
          "0",
          "1/√3",
          "1",
          "√3"
        ],
        "answer": 2,
        "explanation": "Formula: tan θ = sin θ/cos θ.\nAt 45°, sin 45° = cos 45°, so tan 45° = 1.\nతెలుగు: tan 45° = sin 45°/cos 45° = 1."
      },
      {
        "q": "In a right triangle, opposite side = 3 and hypotenuse = 5. Find sin θ.",
        "options": [
          "3/5",
          "4/5",
          "3/4",
          "5/3"
        ],
        "answer": 0,
        "explanation": "Formula: sin θ = Opposite/Hypotenuse.\nsin θ = 3/5.\nతెలుగు: సైన్ = ఎదురుభుజం/కర్ణం = 3/5."
      }
    ,
      {q:"Find sin 30°.",options:["0","1/2","√3/2","1"],answer:1,explanation:"Standard value: sin 30° = 1/2. తెలుగు: sin 30° విలువ 1/2."},
      {q:"Find cos 60°.",options:["0","1/2","√3/2","1"],answer:1,explanation:"Standard value: cos 60° = 1/2. తెలుగు: cos 60° విలువ 1/2."},
      {q:"Find tan 45°.",options:["0","1/√3","1","√3"],answer:2,explanation:"tan 45° = sin45°/cos45° = 1. తెలుగు: tan 45° విలువ 1."},
      {q:"If sin θ = 3/5 for an acute angle, find cos θ.",options:["2/5","3/4","4/5","5/4"],answer:2,explanation:"Using sin²θ+cos²θ=1: cos θ = √(1−9/25)=4/5. తెలుగు: cos θ = 4/5."},
      {q:"Find sec 60°.",options:["1/2","1","2","√3"],answer:2,explanation:"sec θ = 1/cos θ; sec60° = 1/(1/2) = 2. తెలుగు: sec 60° విలువ 2."},
      {q:"Find cot 45°.",options:["0","1","√3","Undefined"],answer:1,explanation:"cot45° = 1/tan45° = 1. తెలుగు: cot 45° విలువ 1."},
      {q:"If tan θ = 3/4 in a right triangle, find sin θ.",options:["3/5","4/5","3/4","4/3"],answer:0,explanation:"Opposite:adjacent = 3:4; hypotenuse = 5; sin θ = opposite/hypotenuse = 3/5. తెలుగు: 3-4-5 త్రిభుజం ఉపయోగించాలి."}
    ],
    "Statistics": [
      {
        "q": "Find the mode of 2, 3, 3, 4, 5.",
        "options": [
          "2",
          "3",
          "4",
          "5"
        ],
        "answer": 1,
        "explanation": "Concept: Mode is the value occurring most frequently.\n3 occurs twice; all others occur once.\nMode = 3.\nతెలుగు: ఎక్కువసార్లు వచ్చిన విలువ బాహుళకం. ఇక్కడ 3."
      },
      {
        "q": "Find the median of 3, 7, 9, 11, 15.",
        "options": [
          "7",
          "9",
          "11",
          "15"
        ],
        "answer": 1,
        "explanation": "Rule: For ordered data with an odd count, median is the middle value.\nThere are 5 values; the 3rd value is 9.\nతెలుగు: ఐదు క్రమబద్ధ సంఖ్యల్లో మధ్యలో ఉన్న మూడో సంఖ్య 9."
      },
      {
        "q": "Find the range of 12, 4, 19, 7, 10.",
        "options": [
          "12",
          "15",
          "19",
          "23"
        ],
        "answer": 1,
        "explanation": "Formula: Range = Maximum − Minimum.\nRange = 19 − 4 = 15.\nతెలుగు: గరిష్ఠ విలువ 19 నుంచి కనిష్ఠ విలువ 4 తీసేస్తే 15."
      }
    ,
      {q:"Find the mean of 4, 6, 8, 10.",options:["6","7","8","9"],answer:1,explanation:"Mean = (4+6+8+10)/4 = 28/4 = 7. తెలుగు: మొత్తం 28; సంఖ్యలు 4."},
      {q:"Find the median of 3, 7, 9, 11, 15.",options:["7","9","11","15"],answer:1,explanation:"Middle value of ordered data is 9. తెలుగు: మధ్య విలువ 9."},
      {q:"Find the mode of 2, 3, 3, 4, 5.",options:["2","3","4","5"],answer:1,explanation:"Mode is the most frequent value; 3 occurs twice. తెలుగు: ఎక్కువసార్లు వచ్చిన సంఖ్య 3."},
      {q:"Find the range of 12, 5, 18, 9.",options:["9","12","13","18"],answer:2,explanation:"Range = maximum−minimum = 18−5 = 13. తెలుగు: గరిష్ఠం నుంచి కనిష్ఠం తీసివేయాలి."},
      {q:"The mean of 5 numbers is 8. Find their total.",options:["13","35","40","45"],answer:2,explanation:"Total = mean×number of values = 8×5 = 40. తెలుగు: మొత్తం = సగటు × సంఖ్యల సంఖ్య."},
      {q:"Find the median of 2, 4, 6, 8.",options:["4","5","6","7"],answer:1,explanation:"Median = average of middle two values = (4+6)/2 = 5. తెలుగు: మధ్య రెండు విలువల సగటు."},
      {q:"In a data set, every value occurs once except 7, which occurs four times. Find the mode.",options:["4","7","Cannot be determined","None"],answer:1,explanation:"Mode is the most frequent value; 7 occurs four times. తెలుగు: మోడ్ 7."}
    ],
    "Data Interpretation": [
      {
        "q": "A table shows sales of 120 units on Monday and 150 on Tuesday. What is the percentage increase?",
        "options": [
          "20%",
          "25%",
          "30%",
          "35%"
        ],
        "answer": 1,
        "explanation": "Formula: Percentage increase = Increase/Original × 100.\nIncrease = 150 − 120 = 30.\nPercentage = 30/120 × 100 = 25%.\nతెలుగు: పెరుగుదల 30. అసలు 120పై శాతం = 25%."
      },
      {
        "q": "A pie chart has 25% of 800 students in one group. How many students are in that group?",
        "options": [
          "150",
          "180",
          "200",
          "250"
        ],
        "answer": 2,
        "explanation": "Formula: Group value = Percentage × Total/100.\n= 25 × 800/100 = 200 students.\nShortcut: 25% is one-fourth; 800 ÷ 4 = 200.\nతెలుగు: 25% అంటే నాలుగో వంతు. 800/4 = 200 మంది."
      },
      {
        "q": "A bar graph gives values 40, 50, 30 and 60. What is their average?",
        "options": [
          "40",
          "45",
          "50",
          "55"
        ],
        "answer": 1,
        "explanation": "Formula: Average = Sum ÷ Count.\nSum = 40 + 50 + 30 + 60 = 180.\nAverage = 180 ÷ 4 = 45.\nతెలుగు: మొత్తం 180; నాలుగు విలువల సగటు 45."
      }
    ,
      {q:"A shop sold 20 pens on Monday and 30 on Tuesday. What is the percentage increase?",options:["25%","40%","50%","60%"],answer:2,explanation:"Increase = 10; percentage = 10/20×100 = 50%. తెలుగు: అసలు సంఖ్య 20 ఆధారంగా శాతం లెక్కించాలి."},
      {q:"A table shows sales of 120 units in January and 150 in February. Find the increase.",options:["20","25","30","35"],answer:2,explanation:"Increase = 150−120 = 30 units. తెలుగు: పెరుగుదల 30 యూనిట్లు."},
      {q:"Total students are 200; 30% are girls. How many girls?",options:["50","60","70","80"],answer:1,explanation:"Girls = 30/100×200 = 60. తెలుగు: 200లో 30% = 60."},
      {q:"A company produces 400 units; 25% are defective. Find good units.",options:["100","200","300","350"],answer:2,explanation:"Defective = 25% of 400 = 100; good units = 400−100 = 300. తెలుగు: మంచి యూనిట్లు 300."},
      {q:"A student scores 72 out of 90. Find percentage.",options:["70%","75%","80%","85%"],answer:2,explanation:"Percentage = 72/90×100 = 80%. తెలుగు: శాతం 80%."},
      {q:"A pie chart represents 40% of 500 people in category A. Find the number in A.",options:["100","150","200","250"],answer:2,explanation:"A = 40/100×500 = 200. తెలుగు: 500లో 40% = 200."},
      {q:"Sales were ₹8,000 in week 1 and ₹10,000 in week 2. Find percentage increase.",options:["20%","25%","30%","40%"],answer:1,explanation:"Increase = ₹2,000; increase% = 2000/8000×100 = 25%. తెలుగు: అమ్మకాలు 25% పెరిగాయి."}
    ]

  };
  const subjectTopicBank = {
    'Reasoning: Series': [
      {q:'Find the next number: 2, 4, 6, 8, ?',options:['9','10','12','14'],answer:1,explanation:'Add 2 each time.'},
      {q:'Find the next number: 5, 10, 15, 20, ?',options:['22','24','25','30'],answer:2,explanation:'Add 5 each time.'},
      {q:'Find the next number: 3, 6, 12, 24, ?',options:['36','42','48','52'],answer:2,explanation:'Multiply by 2 each time.'}
    ,
    {"q":"Find the next number: 2, 4, 6, 8, ?","options":["9","10","11","12"],"answer":1,"explanation":"Add 2 each time."},
    {"q":"Find the next number: 5, 10, 20, 40, ?","options":["45","60","80","100"],"answer":2,"explanation":"Multiply by 2 each time."},
    {"q":"Find the next number: 1, 4, 9, 16, ?","options":["20","24","25","36"],"answer":2,"explanation":"These are squares: 1², 2², 3², 4², 5²."},
    {"q":"Find the next number: 15, 12, 9, 6, ?","options":["4","3","2","1"],"answer":1,"explanation":"Subtract 3 each time."},
    {"q":"Find the next letter: A, C, E, G, ?","options":["H","I","J","K"],"answer":1,"explanation":"Skip one letter each time."},
    {"q":"Find the next number: 3, 6, 12, 24, ?","options":["36","42","48","54"],"answer":2,"explanation":"Multiply by 2 each time."},
    {"q":"Find the next number: 2, 5, 8, 11, ?","options":["12","13","14","15"],"answer":2,"explanation":"Add 3 each time."}
  ],
    'Reasoning: Coding-Decoding': [{q:'If CAT becomes DBU, DOG becomes?',options:['EPH','EOG','DPH','FQI'],answer:0,explanation:'Each letter moves forward by one.'},{q:'If BAT becomes CBU, HEN becomes?',options:['IFO','IFM','GDM','JFO'],answer:0,explanation:'Each letter moves forward by one.'},{q:'If A=1, B=2, what is CAB?',options:['312','213','321','123'],answer:0,explanation:'C=3, A=1, B=2.'},
    {"q":"If SUN is coded as TVO, how is MOON coded?","options":["NPPO","NQPO","MPPO","OPPO"],"answer":0,"explanation":"Each letter moves forward by one."},
    {"q":"If PEN is coded as QFO, how is BOX coded?","options":["CPY","COY","CQY","BPY"],"answer":0,"explanation":"Each letter moves forward by one."},
    {"q":"If CAT is coded as 3-1-20, how is DOG coded?","options":["4-15-7","4-14-7","5-15-7","4-15-8"],"answer":0,"explanation":"Use each letter’s alphabet position."},
    {"q":"If RED is coded as SFE, how is BLUE coded?","options":["CMVF","CLVF","CMUE","BMVF"],"answer":0,"explanation":"Each letter moves forward by one."},
    {"q":"If A=1, B=2, what is BAD?","options":["214","241","124","412"],"answer":0,"explanation":"B=2, A=1, D=4."},
    {"q":"If FISH is coded as GJTI, how is BIRD coded?","options":["CJSE","CJRD","BJSE","DKTF"],"answer":0,"explanation":"Each letter moves forward by one."},
    {"q":"If 1=A, 2=B, 3=C, what is 3-1-2?","options":["ABC","CAB","BAC","CBA"],"answer":1,"explanation":"3=C, 1=A, 2=B."}
  ],
    'Reasoning: Classification': [{q:'Choose the odd one out.',options:['Apple','Mango','Carrot','Banana'],answer:2,explanation:'Carrot is a vegetable; the others are fruits.'},{q:'Choose the odd one out.',options:['Square','Triangle','Circle','Rose'],answer:3,explanation:'Rose is a flower; the others are shapes.'},{q:'Choose the odd one out.',options:['Dog','Cat','Cow','Sparrow'],answer:3,explanation:'Sparrow is a bird; the others are mammals.'},
    {"q":"Choose the odd one out.","options":["January","March","May","Monday"],"answer":3,"explanation":"Monday is a day; the others are months."},
    {"q":"Choose the odd one out.","options":["8","27","64","100"],"answer":3,"explanation":"8, 27 and 64 are cubes; 100 is not a perfect cube."},
    {"q":"Choose the odd one out.","options":["Copper","Iron","Silver","Plastic"],"answer":3,"explanation":"Plastic is not a metal."},
    {"q":"Choose the odd one out.","options":["Cricket","Hockey","Football","Carrot"],"answer":3,"explanation":"Carrot is a vegetable; the others are sports."},
    {"q":"Choose the odd one out.","options":["2","3","5","9"],"answer":3,"explanation":"9 is not a prime number."},
    {"q":"Choose the odd one out.","options":["Triangle","Square","Rectangle","Cylinder"],"answer":3,"explanation":"Cylinder is a 3D solid; the others are plane shapes."},
    {"q":"Choose the odd one out.","options":["Eagle","Parrot","Crow","Tiger"],"answer":3,"explanation":"Tiger is a mammal; the others are birds."}
  ],
    'Reasoning: Blood Relations': [{q:'Your mother’s brother is your:',options:['Paternal uncle','Maternal uncle','Cousin','Nephew'],answer:1,explanation:'He is your maternal uncle.'},{q:'Your father’s sister is your:',options:['Aunt','Niece','Cousin','Grandmother'],answer:0,explanation:'She is your aunt.'},{q:'Your sister’s son is your:',options:['Uncle','Nephew','Cousin','Brother'],answer:1,explanation:'He is your nephew.'},
    {"q":"Your mother’s mother is your:","options":["Aunt","Maternal grandmother","Niece","Sister"],"answer":1,"explanation":"Your mother’s mother is your maternal grandmother."},
    {"q":"Your father’s brother is your:","options":["Maternal uncle","Paternal uncle","Nephew","Grandfather"],"answer":1,"explanation":"Your father’s brother is your paternal uncle."},
    {"q":"Your brother’s daughter is your:","options":["Nephew","Cousin","Niece","Aunt"],"answer":2,"explanation":"A brother’s daughter is a niece."},
    {"q":"Your mother’s sister is your:","options":["Aunt","Niece","Grandmother","Cousin"],"answer":0,"explanation":"Your mother’s sister is your aunt."},
    {"q":"Your son’s son is your:","options":["Nephew","Grandson","Brother","Uncle"],"answer":1,"explanation":"Your son’s son is your grandson."},
    {"q":"Your father’s father is your:","options":["Maternal grandfather","Paternal grandfather","Uncle","Cousin"],"answer":1,"explanation":"Your father’s father is your paternal grandfather."},
    {"q":"Your sister’s daughter is your:","options":["Niece","Nephew","Aunt","Grandmother"],"answer":0,"explanation":"Your sister’s daughter is your niece."}
  ],
    'Reasoning: Direction Sense': [{q:'Facing north, you turn right. Which way now?',options:['West','South','East','North'],answer:2,explanation:'Right from north is east.'},{q:'Facing east, you turn left. Which way now?',options:['North','South','West','East'],answer:0,explanation:'Left from east is north.'},{q:'Facing south, you turn right. Which way now?',options:['East','West','North','South'],answer:1,explanation:'Right from south is west.'},
    {"q":"Facing north, you turn left. Which direction now?","options":["East","West","South","North"],"answer":1,"explanation":"Left from north is west."},
    {"q":"Facing west, you turn right. Which direction now?","options":["North","South","East","West"],"answer":0,"explanation":"Right from west is north."},
    {"q":"Facing south, you turn left. Which direction now?","options":["East","West","North","South"],"answer":0,"explanation":"Left from south is east."},
    {"q":"You walk 5 m north, then 5 m south. Where are you from the start?","options":["5 m north","5 m south","At the starting point","10 m north"],"answer":2,"explanation":"The opposite movements cancel each other."},
    {"q":"Facing east, you turn right. Which direction now?","options":["North","South","West","East"],"answer":1,"explanation":"Right from east is south."},
    {"q":"Facing north, you turn around. Which direction now?","options":["East","West","South","North"],"answer":2,"explanation":"The opposite direction to north is south."},
    {"q":"You walk east and then turn left. Which direction are you facing?","options":["North","South","East","West"],"answer":0,"explanation":"Left from east is north."}
  ],
    'Reasoning: Ranking & Order': [{q:'Ravi is 5th from the top in a class of 20. Position from bottom?',options:['14th','15th','16th','17th'],answer:2,explanation:'20 - 5 + 1 = 16.'},{q:'Maya is 3rd from the left in a row of 10. Position from right?',options:['7th','8th','9th','6th'],answer:1,explanation:'10 - 3 + 1 = 8.'},{q:'A person is 7th from front and 4th from back. Total people?',options:['9','10','11','12'],answer:1,explanation:'7 + 4 - 1 = 10.'},
    {"q":"Ravi is 8th from the top in a class of 25. Position from the bottom?","options":["17th","18th","19th","20th"],"answer":1,"explanation":"25 - 8 + 1 = 18, so the answer is 18th."},
    {"q":"Asha is 4th from the left in a row of 12. Position from the right?","options":["8th","9th","10th","7th"],"answer":1,"explanation":"12 - 4 + 1 = 9."},
    {"q":"A boy is 6th from the front and 5th from the back. Total people?","options":["9","10","11","12"],"answer":1,"explanation":"6 + 5 - 1 = 10."},
    {"q":"Mina ranks 2nd in a class of 18. How many students rank below her?","options":["15","16","17","18"],"answer":1,"explanation":"18 - 2 = 16 students rank below her."},
    {"q":"Raj is 10th from the top and 15th from the bottom. Total students?","options":["23","24","25","26"],"answer":1,"explanation":"10 + 15 - 1 = 24."},
    {"q":"In a row of 20, Sam is 7th from the right. Position from the left?","options":["12th","13th","14th","15th"],"answer":2,"explanation":"20 - 7 + 1 = 14."},
    {"q":"There are 30 students. Kiran is 12th from the top. How many are below Kiran?","options":["17","18","19","20"],"answer":1,"explanation":"30 - 12 = 18 students are below Kiran."}
  ],
    'Reasoning: Syllogism': [{q:'All cats are animals. All animals need food. What follows?',options:['All cats need food','No cats need food','All food is cats','None'],answer:0,explanation:'The conclusion follows from both statements.'},{q:'All roses are flowers. Which must be true?',options:['All flowers are roses','All roses are flowers','No rose is a flower','All flowers are red'],answer:1,explanation:'This repeats the given statement.'},{q:'Some pens are blue. Which is definitely true?',options:['All pens are blue','Some pens are blue','No pens are blue','All blue things are pens'],answer:1,explanation:'This is stated directly.'},
    {"q":"All dogs are animals. All animals need food. What follows?","options":["All dogs need food","No dogs need food","All animals are dogs","None"],"answer":0,"explanation":"The conclusion follows from both statements."},
    {"q":"All pens are stationery. Some stationery is costly. Must all pens be costly?","options":["Yes","No, not necessarily","All stationery is pens","None"],"answer":1,"explanation":"The statements do not establish that pens are costly."},
    {"q":"No fish is a bird. All sparrows are birds. What follows?","options":["All fish are sparrows","No sparrow is a fish","Some fish are birds","None"],"answer":1,"explanation":"Sparrows are birds, and no fish is a bird."},
    {"q":"All roses are flowers. All flowers are plants. What follows?","options":["All roses are plants","All plants are roses","No roses are plants","None"],"answer":0,"explanation":"Roses belong to the group of flowers, which are plants."},
    {"q":"Some books are novels. Which must be true?","options":["All books are novels","Some books are novels","No books are novels","All novels are books"],"answer":1,"explanation":"This repeats the given statement."},
    {"q":"All cars are vehicles. No vehicle is a tree. What follows?","options":["Some cars are trees","No cars are trees","All trees are cars","None"],"answer":1,"explanation":"Cars are vehicles, and vehicles are not trees."},
    {"q":"Some students are athletes. All athletes are fit. What follows?","options":["Some students are fit","All students are athletes","No athletes are fit","None"],"answer":0,"explanation":"The students who are athletes are fit."}
  ],
    'English: Synonyms & Antonyms': [{q:'Synonym of Rapid:',options:['Slow','Fast','Weak','Late'],answer:1,explanation:'Rapid means fast.'},{q:'Antonym of Ancient:',options:['Old','Historic','Modern','Past'],answer:2,explanation:'Modern is the opposite of ancient.'},{q:'Synonym of Brave:',options:['Courageous','Afraid','Lazy','Quiet'],answer:0,explanation:'Brave means courageous.'}],
    'English: Spelling': [{q:'Choose the correct spelling.',options:['Accomodation','Accommodation','Acommodation','Accommadation'],answer:1,explanation:'Accommodation is correct.'},{q:'Choose the correct spelling.',options:['Seperate','Separate','Seperete','Separrate'],answer:1,explanation:'Separate is correct.'},{q:'Choose the correct spelling.',options:['Necessary','Neccessary','Necesary','Necessery'],answer:0,explanation:'Necessary is correct.'}],
    'English: Grammar': [{q:'Choose the correct sentence.',options:['She go to school.','She goes to school.','She going school.','She gone to school.'],answer:1,explanation:'Use goes with she in the simple present.'},{q:'He is ___ honest man.',options:['a','an','the','no article'],answer:1,explanation:'Honest starts with a vowel sound.'},{q:'Identify the noun: “Birds fly high.”',options:['Fly','High','Birds','The'],answer:2,explanation:'Birds is a noun.'}],
    'English: Tenses': [{q:'She ___ to school every day.',options:['go','goes','went','going'],answer:1,explanation:'Simple present with she uses goes.'},{q:'They ___ cricket yesterday.',options:['play','plays','played','playing'],answer:2,explanation:'Yesterday indicates past tense.'},{q:'I ___ my homework now.',options:['do','did','am doing','done'],answer:2,explanation:'Now indicates present continuous.'}],
    'English: Subject-Verb Agreement': [{q:'Each of the boys ___ present.',options:['are','were','is','be'],answer:2,explanation:'Each takes a singular verb.'},{q:'The news ___ true.',options:['are','is','were','have'],answer:1,explanation:'News takes a singular verb.'},{q:'Neither Ravi nor his friends ___ here.',options:['is','was','are','has'],answer:2,explanation:'The verb agrees with the nearer subject friends.'}],
    'English: Articles': [{q:'She bought ___ umbrella.',options:['a','an','the','no article'],answer:1,explanation:'Umbrella begins with a vowel sound.'},{q:'He is ___ university student.',options:['a','an','the','no article'],answer:0,explanation:'University begins with a “you” sound.'},{q:'The sun rises in ___ east.',options:['a','an','the','no article'],answer:2,explanation:'Use the in this expression.'}],
    'English: Prepositions': [{q:'The book is ___ the table.',options:['on','at','by','into'],answer:0,explanation:'On indicates a surface.'},{q:'She has lived here ___ 2020.',options:['for','since','from','by'],answer:1,explanation:'Since is used with a starting point.'},{q:'He is good ___ mathematics.',options:['in','on','at','with'],answer:2,explanation:'The usual phrase is good at.'}],
    'English: Vocabulary': [{q:'Benevolent means:',options:['Kind','Cruel','Careless','Angry'],answer:0,explanation:'Benevolent means kind.'},{q:'Fragile means:',options:['Strong','Easily broken','Heavy','Bright'],answer:1,explanation:'Fragile means easily broken.'},{q:'Brief means:',options:['Short','Long','Loud','Difficult'],answer:0,explanation:'Brief means short.'}],
    'General Knowledge: Indian History': [{q:'Who founded the Mughal Empire in India?',options:['Akbar','Babur','Humayun','Shah Jahan'],answer:1,explanation:'Babur founded the Mughal Empire in India.'},{q:'Quit India Movement began in:',options:['1930','1942','1947','1919'],answer:1,explanation:'It began in 1942.'},{q:'Who is called the Iron Man of India?',options:['Nehru','Sardar Patel','Subhas Bose','Ambedkar'],answer:1,explanation:'Sardar Vallabhbhai Patel is known by this title.'}],
    'General Knowledge: Indian Geography': [{q:'Largest Indian state by area?',options:['Uttar Pradesh','Madhya Pradesh','Rajasthan','Maharashtra'],answer:2,explanation:'Rajasthan is the largest by area.'},{q:'Which ocean lies south of India?',options:['Atlantic','Pacific','Indian Ocean','Arctic'],answer:2,explanation:'The Indian Ocean lies south of India.'},{q:'Which is the longest river flowing entirely within India?',options:['Ganga','Godavari','Narmada','Krishna'],answer:1,explanation:'Godavari is the longest river flowing entirely within India.'}],
    'General Knowledge: Indian Polity': [{q:'When did the Constitution of India come into effect?',options:['15 August 1947','26 January 1950','26 November 1949','2 October 1950'],answer:1,explanation:'It came into effect on 26 January 1950.'},{q:'Who is the constitutional head of India?',options:['Prime Minister','President','Chief Justice','Governor'],answer:1,explanation:'The President is the constitutional head of the Union.'},{q:'Fundamental Rights are in which part?',options:['Part I','Part II','Part III','Part IV'],answer:2,explanation:'Fundamental Rights are in Part III.'}],
    'General Knowledge: General Science': [{q:'Which planet is called the Red Planet?',options:['Venus','Mars','Jupiter','Mercury'],answer:1,explanation:'Mars is known as the Red Planet.'},{q:'Chemical formula of water?',options:['CO2','O2','H2O','NaCl'],answer:2,explanation:'Water is H2O.'},{q:'Which organ pumps blood?',options:['Lungs','Brain','Heart','Kidney'],answer:2,explanation:'The heart pumps blood.'}],
    'General Knowledge: Indian Economy': [{q:'Currency of India?',options:['Rupee','Taka','Riyal','Yen'],answer:0,explanation:'India uses the Indian rupee.'},{q:'Which institution issues most Indian currency notes?',options:['SBI','RBI','SEBI','NITI Aayog'],answer:1,explanation:'The RBI issues most banknotes.'},{q:'GDP stands for:',options:['Gross Domestic Product','General Development Plan','Global Domestic Price','Gross Demand Product'],answer:0,explanation:'GDP means Gross Domestic Product.'}],
    'General Knowledge: Static GK': [{q:'National animal of India?',options:['Lion','Tiger','Elephant','Leopard'],answer:1,explanation:'The tiger is India’s national animal.'},{q:'National flower of India?',options:['Rose','Lotus','Lily','Jasmine'],answer:1,explanation:'The lotus is India’s national flower.'},{q:'National anthem of India?',options:['Vande Mataram','Jana Gana Mana','Saare Jahan Se Achha','Ae Mere Watan'],answer:1,explanation:'Jana Gana Mana is the national anthem.'}],
    'General Knowledge: Important Days': [{q:'India’s Independence Day is:',options:['26 January','15 August','2 October','14 November'],answer:1,explanation:'Independence Day is 15 August.'},{q:'World Environment Day is:',options:['5 June','22 April','1 May','10 December'],answer:0,explanation:'It is observed on 5 June.'},{q:'Constitution Day in India is:',options:['26 January','15 August','26 November','2 October'],answer:2,explanation:'It is observed on 26 November.'}],
    'General Knowledge: Books & Authors': [{q:'Who wrote The Discovery of India?',options:['M. K. Gandhi','Jawaharlal Nehru','Rabindranath Tagore','R. K. Narayan'],answer:1,explanation:'Jawaharlal Nehru wrote it.'},{q:'Who wrote Gitanjali?',options:['Sarojini Naidu','Rabindranath Tagore','Bankim Chandra Chatterjee','Premchand'],answer:1,explanation:'Rabindranath Tagore wrote Gitanjali.'},{q:'Wings of Fire is associated with which author?',options:['A. P. J. Abdul Kalam','Vikram Seth','R. K. Narayan','Chetan Bhagat'],answer:0,explanation:'It is the autobiography of A. P. J. Abdul Kalam, co-authored with Arun Tiwari.'}]
  };

  // ENGLISH_GK_10Q_EXTENSION
  const englishGkExtra = {
    'English: Synonyms & Antonyms': [
      ['Antonym of “Expand”:', ['Increase','Extend','Contract','Enlarge'], 2, 'Contract means to become smaller.'],
      ['Synonym of “Assist”:', ['Help','Hinder','Refuse','Stop'], 0, 'Assist means help.'],
      ['Antonym of “Victory”:', ['Success','Defeat','Triumph','Win'], 1, 'Defeat is the opposite of victory.'],
      ['Synonym of “Abundant”:', ['Rare','Plentiful','Empty','Tiny'], 1, 'Abundant means plentiful.'],
      ['Antonym of “Optimistic”:', ['Hopeful','Positive','Cheerful','Pessimistic'], 3, 'Pessimistic is the opposite of optimistic.'],
      ['Synonym of “Diligent”:', ['Lazy','Careless','Hardworking','Weak'], 2, 'Diligent means hardworking.'],
      ['Antonym of “Permanent”:', ['Lasting','Fixed','Temporary','Stable'], 2, 'Temporary means not permanent.']
    ],
    'English: Spelling': [
      ['Choose the correct spelling:', ['Definately','Definitely','Definatly','Definetely'], 1, 'Definitely is the correct spelling.'],
      ['Choose the correct spelling:', ['Occasion','Ocassion','Occassion','Ocaasion'], 0, 'Occasion has one c after o and double s.'],
      ['Choose the correct spelling:', ['Privilege','Privelege','Priviledge','Privilage'], 0, 'Privilege is correct.'],
      ['Choose the correct spelling:', ['Government','Goverment','Governmant','Govarnment'], 0, 'Government is correct.'],
      ['Choose the correct spelling:', ['Receive','Recieve','Receeve','Receve'], 0, 'Receive follows “i before e” exception after c.'],
      ['Choose the correct spelling:', ['Environment','Enviroment','Environmant','Envirnoment'], 0, 'Environment is correct.'],
      ['Choose the correct spelling:', ['Separate','Seperate','Seperete','Separrate'], 0, 'Separate is correct.']
    ],
    'English: Grammar': [
      ['Choose the correct sentence:', ['They was late.','They were late.','They is late.','They be late.'], 1, 'They takes were in the past tense.'],
      ['Identify the adjective: “It is a beautiful day.”', ['It','Is','Beautiful','Day'], 2, 'Beautiful describes the noun day.'],
      ['Choose the correct pronoun: “Ravi and ___ went home.”', ['me','I','mine','my'], 1, 'I is the subject pronoun.'],
      ['What is the plural of “child”?', ['Childs','Childes','Children','Childrens'], 2, 'Children is the plural form.'],
      ['Choose the correct sentence:', ['She has finished her work.','She have finished her work.','She finishing her work.','She finish her work yesterday.'], 0, 'She takes has in the present perfect.'],
      ['Identify the adverb: “He ran quickly.”', ['He','Ran','Quickly','None'], 2, 'Quickly describes how he ran.'],
      ['Choose the correct comparative form of “good”:', ['Gooder','More good','Best','Better'], 3, 'Better is the comparative form of good.']
    ],
    'English: Tenses': [
      ['He ___ here since morning.', ['is','was','has been','will'], 2, 'Since morning calls for present perfect continuous or present perfect context; has been is correct here.'],
      ['By next year, she ___ her course.', ['completes','completed','will have completed','has complete'], 2, 'Future perfect describes completion before a future time.'],
      ['When I arrived, they ___ dinner.', ['have','had','were having','will have'], 2, 'Past continuous describes an action in progress at that time.'],
      ['Water ___ at 100°C at standard pressure.', ['boil','boils','boiled','boiling'], 1, 'General facts use the simple present.'],
      ['I ___ him last week.', ['meet','meets','met','meeting'], 2, 'Last week indicates the simple past.'],
      ['Look! The baby ___.', ['cries','cried','is crying','cry'], 2, 'Look indicates an action happening now.'],
      ['She usually ___ tea in the morning.', ['drink','drinks','drank','drinking'], 1, 'A habitual action uses simple present; she takes drinks.']
    ],
    'English: Subject-Verb Agreement': [
      ['One of my friends ___ in Delhi.', ['live','lives','are living','were'], 1, 'The subject one is singular.'],
      ['The players ___ ready for the match.', ['is','was','are','has'], 2, 'Players is plural, so use are.'],
      ['Mathematics ___ my favourite subject.', ['are','is','were','have'], 1, 'Names of academic subjects ending in -s usually take a singular verb.'],
      ['Neither the teacher nor the students ___ absent.', ['is','was','are','has'], 2, 'The verb agrees with the nearer plural subject students.'],
      ['A pair of shoes ___ on the floor.', ['are','were','is','have'], 2, 'The head subject pair is singular.'],
      ['Everyone ___ responsible for the task.', ['are','is','were','have'], 1, 'Everyone takes a singular verb.'],
      ['The quality of these mangoes ___ good.', ['are','were','is','have'], 2, 'The subject quality is singular.']
    ],
    'English: Articles': [
      ['He waited for ___ hour.', ['a','an','the','no article'], 1, 'Hour begins with a vowel sound.'],
      ['She plays ___ piano well.', ['a','an','the','no article'], 2, 'The is commonly used with musical instruments.'],
      ['Mount Everest is ___ highest peak in the world.', ['a','an','the','no article'], 2, 'Use the with superlative adjectives.'],
      ['I saw ___ one-eyed man.', ['a','an','the','no article'], 0, 'One begins with a “w” sound, so use a.'],
      ['He is ___ European citizen.', ['a','an','the','no article'], 0, 'European begins with a “you” sound.'],
      ['The Ganga is ___ sacred river.', ['a','an','the','no article'], 0, 'A is used for a singular countable noun introduced generally.'],
      ['She is ___ MLA.', ['a','an','the','no article'], 1, 'M is pronounced “em”, beginning with a vowel sound.']
    ],
    'English: Prepositions': [
      ['The train arrived ___ time.', ['at','on','in','by'], 1, 'On time means punctual.'],
      ['He has been ill ___ Monday.', ['for','since','during','from'], 1, 'Since marks a starting point.'],
      ['The cat jumped ___ the wall.', ['over','between','among','beside'], 0, 'Over indicates movement across or above.'],
      ['She is interested ___ music.', ['on','at','in','for'], 2, 'The correct phrase is interested in.'],
      ['Divide the sweets ___ the two children.', ['among','between','inside','across'], 1, 'Between is used for two people or things.'],
      ['The meeting starts ___ 10 a.m.', ['in','on','at','by'], 2, 'At is used for a specific time.'],
      ['He walked ___ the room quietly.', ['into','onto','between','during'], 0, 'Into indicates movement to the inside.']
    ],
    'English: Vocabulary': [
      ['“Reluctant” means:', ['Unwilling','Excited','Certain','Carefree'], 0, 'Reluctant means unwilling or hesitant.'],
      ['“Enormous” means:', ['Tiny','Huge','Narrow','Weak'], 1, 'Enormous means very large.'],
      ['“Candid” means:', ['Honest','Secretive','Angry','Confused'], 0, 'Candid means truthful and frank.'],
      ['“Obsolete” means:', ['Modern','Useful','Outdated','Popular'], 2, 'Obsolete means no longer in use.'],
      ['“Inevitable” means:', ['Avoidable','Uncertain','Unavoidable','Optional'], 2, 'Inevitable means certain to happen.'],
      ['“Mitigate” means:', ['Worsen','Reduce','Ignore','Repeat'], 1, 'Mitigate means to make less severe.'],
      ['“Prudent” means:', ['Careless','Wise','Impatient','Rude'], 1, 'Prudent means wise and careful.']
    ],
    'General Knowledge: Indian History': [
      ['Who was the first Mughal emperor of India?', ['Akbar','Babur','Humayun','Aurangzeb'], 1, 'Babur established Mughal rule in India in 1526.'],
      ['The Battle of Plassey was fought in:', ['1757','1764','1857','1942'], 0, 'The Battle of Plassey took place in 1757.'],
      ['Who founded the Maurya Empire?', ['Ashoka','Chandragupta Maurya','Harsha','Kanishka'], 1, 'Chandragupta Maurya founded the Maurya Empire.'],
      ['Who gave the slogan “Do or Die”?', ['Bhagat Singh','Mahatma Gandhi','Sardar Patel','Bal Gangadhar Tilak'], 1, 'Gandhi gave this slogan during the Quit India Movement.'],
      ['The Jallianwala Bagh massacre occurred in:', ['1905','1919','1927','1942'], 1, 'It occurred in Amritsar in 1919.'],
      ['Who was the first woman ruler of the Delhi Sultanate?', ['Nur Jahan','Razia Sultan','Rani Durgavati','Chand Bibi'], 1, 'Razia Sultan ruled the Delhi Sultanate in the 13th century.'],
      ['Who founded the Indian National Congress in 1885 with other leaders?', ['A. O. Hume','Lord Curzon','Lord Mountbatten','Robert Clive'], 0, 'A. O. Hume played a leading role in its founding.']
    ],
    'General Knowledge: Indian Geography': [
      ['Which is the highest mountain peak located entirely in India?', ['Nanda Devi','K2','Anamudi','Guru Shikhar'], 0, 'Nanda Devi is the highest peak located entirely within India.'],
      ['Which Indian state has the longest coastline?', ['Tamil Nadu','Gujarat','Kerala','Odisha'], 1, 'Gujarat has the longest coastline among Indian states.'],
      ['The Thar Desert is mainly located in:', ['Rajasthan','Assam','Bihar','Kerala'], 0, 'The Thar Desert is mainly in Rajasthan.'],
      ['Which river is known as the “Sorrow of Bihar”?', ['Yamuna','Kosi','Tapti','Mahanadi'], 1, 'The Kosi has historically caused severe flooding in Bihar.'],
      ['Which soil is best known for cotton cultivation?', ['Alluvial','Black','Laterite','Desert'], 1, 'Black soil retains moisture and is suitable for cotton.'],
      ['The Western Ghats run roughly parallel to India’s:', ['East coast','West coast','Northern border','Desert border'], 1, 'The Western Ghats run along the western side of India.'],
      ['Which is the largest brackish-water lagoon in India?', ['Dal Lake','Chilika Lake','Wular Lake','Sambhar Lake'], 1, 'Chilika Lake is a large brackish-water lagoon in Odisha.']
    ],
    'General Knowledge: Indian Polity': [
      ['How many Fundamental Duties are currently listed in the Constitution?', ['10','11','12','9'], 1, 'There are 11 Fundamental Duties.'],
      ['Who is the Chairman of the Rajya Sabha?', ['President','Vice-President','Prime Minister','Speaker of Lok Sabha'], 1, 'India’s Vice-President is ex officio Chairman of the Rajya Sabha.'],
      ['Which Article deals with equality before law?', ['Article 14','Article 19','Article 21','Article 32'], 0, 'Article 14 guarantees equality before law and equal protection of laws.'],
      ['What is the minimum age to become President of India?', ['25 years','30 years','35 years','40 years'], 2, 'A presidential candidate must be at least 35.'],
      ['A Money Bill can be introduced only in the:', ['Rajya Sabha','Lok Sabha','Supreme Court','State Legislative Council'], 1, 'A Money Bill can be introduced only in the Lok Sabha.'],
      ['Who appoints the Governor of an Indian state?', ['Chief Minister','President','Chief Justice','State Assembly'], 1, 'The President appoints state Governors.'],
      ['Which body conducts elections to Parliament and state legislatures?', ['UPSC','Election Commission of India','Finance Commission','NITI Aayog'], 1, 'The Election Commission of India supervises these elections.']
    ],
    'General Knowledge: General Science': [
      ['What is the SI unit of force?', ['Joule','Watt','Newton','Pascal'], 2, 'Force is measured in newtons.'],
      ['Which gas do plants absorb during photosynthesis?', ['Oxygen','Carbon dioxide','Nitrogen','Hydrogen'], 1, 'Plants absorb carbon dioxide for photosynthesis.'],
      ['Which vitamin is produced in skin with sunlight exposure?', ['Vitamin A','Vitamin B12','Vitamin C','Vitamin D'], 3, 'Sunlight helps the skin produce vitamin D.'],
      ['What is the boiling point of water at standard atmospheric pressure?', ['0°C','50°C','100°C','150°C'], 2, 'Water boils at 100°C at standard atmospheric pressure.'],
      ['Which part of the cell contains most genetic material?', ['Nucleus','Cell wall','Ribosome','Cytoplasm only'], 0, 'The nucleus contains most of a cell’s DNA.'],
      ['Which blood cells help fight infections?', ['Red blood cells','White blood cells','Platelets','Plasma only'], 1, 'White blood cells help defend the body against infection.'],
      ['Which instrument measures temperature?', ['Barometer','Thermometer','Ammeter','Hygrometer'], 1, 'A thermometer measures temperature.']
    ],
    'General Knowledge: Indian Economy': [
      ['What does RBI stand for?', ['Reserve Bank of India','Rural Bank of India','Revenue Board of India','Regional Banking Institute'], 0, 'RBI stands for Reserve Bank of India.'],
      ['Which tax is levied on the supply of goods and services in India?', ['GST','TDS only','Custom duty only','Road tax'], 0, 'GST is the Goods and Services Tax.'],
      ['What is inflation?', ['A fall in prices','A general rise in prices','A rise in rainfall','A fall in population'], 1, 'Inflation is a general increase in the price level.'],
      ['Which institution replaced the Planning Commission?', ['SEBI','NITI Aayog','NABARD','CAG'], 1, 'NITI Aayog replaced the Planning Commission in 2015.'],
      ['Which sector includes farming and fishing?', ['Primary','Secondary','Tertiary','Quaternary only'], 0, 'Farming and fishing belong to the primary sector.'],
      ['What does ATM commonly stand for in banking?', ['Automated Teller Machine','Automatic Transfer Method','Account Tracking Mode','Any Time Money'], 0, 'ATM stands for Automated Teller Machine.'],
      ['Which organisation regulates the securities market in India?', ['RBI','SEBI','IRDAI','FSSAI'], 1, 'SEBI regulates India’s securities market.']
    ],
    'General Knowledge: Static GK': [
      ['What is the national bird of India?', ['Peacock','Parrot','Eagle','Swan'], 0, 'The Indian peacock is the national bird.'],
      ['What is the national aquatic animal of India?', ['Blue whale','Ganges river dolphin','Crocodile','Sea turtle'], 1, 'The Ganges river dolphin is India’s national aquatic animal.'],
      ['Which is the largest planet in the Solar System?', ['Earth','Saturn','Jupiter','Neptune'], 2, 'Jupiter is the largest planet.'],
      ['How many colours are traditionally listed in the Indian national flag?', ['Two','Three','Four','Five'], 1, 'The flag has three horizontal colour bands.'],
      ['Which is the smallest continent by land area?', ['Europe','Australia','South America','Antarctica'], 1, 'Australia is the smallest continent by land area.'],
      ['What is the currency of the United Kingdom?', ['Euro','Pound sterling','Dollar','Franc'], 1, 'The UK uses the pound sterling.'],
      ['Which planet is famous for its prominent rings?', ['Mars','Venus','Saturn','Mercury'], 2, 'Saturn is known for its prominent ring system.']
    ],
    'General Knowledge: Important Days': [
      ['World Health Day is observed on:', ['7 April','5 June','1 December','10 October'], 0, 'World Health Day is observed on 7 April.'],
      ['International Yoga Day is observed on:', ['21 June','11 July','24 October','8 March'], 0, 'International Yoga Day is observed on 21 June.'],
      ['National Science Day in India is:', ['28 February','15 August','5 September','14 November'], 0, 'National Science Day is observed on 28 February.'],
      ['World AIDS Day is observed on:', ['1 December','7 April','22 March','16 September'], 0, 'World AIDS Day is observed on 1 December.'],
      ['Teachers’ Day in India is celebrated on:', ['5 September','14 November','2 October','12 January'], 0, 'India celebrates Teachers’ Day on 5 September.'],
      ['International Women’s Day is observed on:', ['8 March','21 June','1 May','10 December'], 0, 'International Women’s Day is observed on 8 March.'],
      ['World Water Day is observed on:', ['22 March','22 April','5 June','16 October'], 0, 'World Water Day is observed on 22 March.']
    ],
    'General Knowledge: Books & Authors': [
      ['Who wrote “The Guide”?', ['R. K. Narayan','Mulk Raj Anand','Khushwant Singh','Vikram Seth'], 0, 'R. K. Narayan wrote The Guide.'],
      ['Who wrote “Anandamath”?', ['Bankim Chandra Chatterjee','Rabindranath Tagore','Premchand','Sarojini Naidu'], 0, 'Bankim Chandra Chatterjee wrote Anandamath.'],
      ['Who wrote “The God of Small Things”?', ['Arundhati Roy','Jhumpa Lahiri','Kiran Desai','Anita Desai'], 0, 'Arundhati Roy wrote this novel.'],
      ['Who wrote “Malgudi Days”?', ['R. K. Narayan','Ruskin Bond','Amitav Ghosh','Vikram Seth'], 0, 'Malgudi Days is by R. K. Narayan.'],
      ['Who wrote “The Jungle Book”?', ['Rudyard Kipling','Charles Dickens','Mark Twain','Jules Verne'], 0, 'Rudyard Kipling wrote The Jungle Book.'],
      ['Who wrote “A Brief History of Time”?', ['Stephen Hawking','Isaac Newton','Carl Sagan','Albert Einstein'], 0, 'Stephen Hawking wrote A Brief History of Time.'],
      ['Who wrote “India Wins Freedom”?', ['Maulana Abul Kalam Azad','Jawaharlal Nehru','Sardar Patel','Rajendra Prasad'], 0, 'India Wins Freedom is associated with Maulana Abul Kalam Azad.']
    ]
  };

  for (const [topic, rows] of Object.entries(englishGkExtra)) {
    if (!subjectTopicBank[topic]) {
      throw new Error('Missing topic key: ' + topic);
    }
    if (subjectTopicBank[topic].length !== 3) {
      throw new Error('Expected 3 existing questions for ' + topic + ', found ' + subjectTopicBank[topic].length);
    }
    subjectTopicBank[topic].push(...rows.map(([q, options, answer, explanation]) => ({
      q, options, answer, explanation
    })));
  }

  const quantQuestions = (subjectTopicBank[quantTopic] && subjectTopicBank[quantTopic].length > 0)
    ? subjectTopicBank[quantTopic]
    : (quantBank[quantTopic] || []);
  const allSubjectsMockQuestions = [
    ...(questionBank['Mathematics'] || []),
    ...(questionBank['Reasoning'] || []),
    ...(questionBank['English'] || []),
    ...(questionBank['General Knowledge'] || [])
  ];

  const startAllSubjectsMock = () => {
    if (!allSubjectsMockQuestions.length) {
      console.log('All Subjects Mock has no questions available.');
      return;
    }
    setCurrentSubject('All Subjects Mock');
    setQuantTopic('');
    setQuestion(0);
    setAnswers({});
    setScore(null);
    setTimeLeft(1800);
    setIsTestPaused(false);
    setPage('Mock Tests');
  };

  const questions = currentSubject === 'All Subjects Mock'
    ? allSubjectsMockQuestions
    : subjectTopicBank[quantTopic] && subjectTopicBank[quantTopic].length > 0
    ? subjectTopicBank[quantTopic]
    : (quantTopic && quantBank[quantTopic] && quantBank[quantTopic].length > 0
      ? quantBank[quantTopic]
      : (currentSubject === 'Number System'
        ? (quantBank['Number System'] || questionBank['Mathematics'])
        : (questionBank[currentSubject] || [])));


  const subjects = [
    ['Mathematics', 'Numbers, arithmetic and algebra', '📐'],
    ['Reasoning', 'Logic, series and puzzles', '🧠'],
    ['English', 'Grammar and vocabulary', '📖'],
    ['General Knowledge', 'History, geography and science', '🌍'],
  ];

  const startTest = (subject = 'Mathematics', topic = '') => {
    setCurrentSubject(subject);
    setQuantTopic(topic);
    setQuestion(0);
    setAnswers({});
    setScore(null);
    setTimeLeft(900);
    setIsTestPaused(false);
    setPage('Mock Tests');
  };

  const deleteTestResult = (index) => {
    const removeResult = () => {
      setResults(old => old.filter((_, i) => i !== index));
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' &&
          window.confirm('Are you sure you want to delete this test result?')) {
        removeResult();
      }
    } else {
      Alert.alert('Delete Result', 'ఈ test result‌ను delete చేయాలా?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: removeResult }
      ]);
    }
  };

  const retryTestResult = (r) => {
    if (r?.type === 'all-subjects-mock' || r?.subject === 'All Subjects Mock') {
      startAllSubjectsMock();
      return;
    }
    if (r?.type === 'practice') {
      setQuantTopic(r.topic || '');
      setQuantQuestion(0);
      setQuantAnswers({});
      setQuantFinished(false);
      setQuantResultSaved(false);
      setPage('Quant Questions');
      return;
    }

    if (r?.topic &&
        ['Reasoning', 'English', 'General Knowledge'].includes(r.subject)) {
      setQuantTopic(r.topic);
      setQuantQuestion(0);
      setQuantAnswers({});
      setQuantFinished(false);
      setQuantResultSaved(false);
      setPage('Quant Questions');
      return;
    }

    startTest(r?.subject || 'Mathematics', r?.topic || '');
  };

  const finishQuantPractice = () => {
    if (!quantResultSaved) {
      const total = quantQuestions.length;
      const score = quantQuestions.reduce(
        (n, q, i) => n + (
          quantAnswers[i] !== undefined &&
          Number(quantAnswers[i]) === Number(q.answer) ? 1 : 0
        ), 0
      );
      const answered = Object.keys(quantAnswers).length;
      const topicName = quantTopic || 'Practice';
      const subject = /^(Reasoning|English|General Knowledge): /.test(topicName)
        ? topicName.split(':')[0]
        : 'Mathematics';

      setResults(old => [{
        subject,
        topic: topicName,
        type: 'practice',
        score,
        total,
        incorrect: answered - score,
        unanswered: Math.max(0, total - answered),
        date: new Date().toLocaleDateString()
      }, ...old]);
      setQuantResultSaved(true);
    }
    setQuantFinished(true);
  };

  const submitTest = () => {
    const result = questions.reduce(
      (total, item, i) => total + (answers[i] === item.answer ? 1 : 0), 0
    );
    const incorrect = Object.keys(answers).filter(
      k => answers[k] !== questions[Number(k)].answer
    ).length;
    const testResult = {
      ...(currentSubject === 'All Subjects Mock' ? { type: 'all-subjects-mock' } : {}),

      subject: currentSubject,
      score: result,
      total: questions.length,
      incorrect,
      unanswered: questions.length - Object.keys(answers).length,
      date: new Date().toLocaleDateString()
    };
    setScore(result);
    setResults(old => [testResult, ...old]);
  };

  useEffect(() => {
    if (page !== 'Mock Tests' || score !== null || isTestPaused) return;
    if (timeLeft <= 0) {
      submitTest();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [page, score, timeLeft, isTestPaused]);

  const button = (label, action, primary = false, textColor = null) => (
    <TouchableOpacity
      onPress={action}
      style={[styles.button, primary && styles.primaryButton, {overflow:'hidden', position:'relative'}]}
      activeOpacity={0.82}
    >
      {Platform.OS === 'web' && (
        <View
          pointerEvents="none"
          style={{
            position:'absolute', top:0, bottom:0, left:0, right:0,
            borderRadius:11,
            backgroundImage:'linear-gradient(105deg, #173B83 0%, #2457D6 35%, #7045E8 65%, #08A6C9 100%)',
            backgroundSize:'250% 100%',
            animation:'veerButtonColorFlow 5s ease-in-out infinite'
          }}
        />
      )}
      <Text style={[
        styles.buttonText,
        primary && styles.primaryText,
        {color: textColor || '#FFFFFF', zIndex:1},
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const passwordChecks = [
    { label: 'At least 8 characters', valid: password.length >= 8 },
    { label: 'One uppercase letter (A-Z)', valid: /[A-Z]/.test(password) },
    { label: 'One lowercase letter (a-z)', valid: /[a-z]/.test(password) },
    { label: 'One number (0-9)', valid: /[0-9]/.test(password) },
    { label: 'One special character (@, #, !)', valid: /[^A-Za-z0-9]/.test(password) },
  ];

  const handlePasswordReset = async () => {
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setAuthError('Please enter your registered email address first.');
      return;
    }

    setAuthBusy(true);
    setAuthError('');

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      Alert.alert(
        'Check your email',
        'If an account exists for this email, Firebase will send a password reset link. Check your inbox and spam folder.'
      );
    } catch (error) {
      const messages = {
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/user-not-found': 'No account was found for this email address.',
        'auth/too-many-requests': 'Too many requests. Please try again later.',
        'auth/network-request-failed': 'Network error. Check your internet connection.'
      };
      setAuthError(messages[error.code] || 'Could not send the reset email. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAuth = async () => {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setAuthError('Please enter your email and password.');
      return;
    }

    if (isCreatingAccount && !fullName.trim()) {
      setAuthError('Please enter your full name.');
      return;
    }

    if (isCreatingAccount && !passwordChecks.every(rule => rule.valid)) {
      setAuthError('Please meet all password requirements.');
      return;
    }

    setAuthBusy(true);
    setAuthError('');

    try {
      if (isCreatingAccount) {
        const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(credential.user, { displayName: fullName.trim() });
        await signOut(auth);
        setPassword('');
        setAuthError('');
        setAccountSuccessName(fullName.trim());
        setShowAccountSuccess(true);
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      }
    } catch (error) {
      const messages = {
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/invalid-credential': 'Email or password is incorrect.',
        'auth/email-already-in-use': 'This email already has an account. Please log in.',
        'auth/weak-password': 'Please use a password with at least 6 characters.',
        'auth/network-request-failed': 'Network error. Check your internet connection.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.'
      };
      setAuthError(messages[error.code] || 'Authentication failed. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  };


  const handleSendPhoneOtp = async () => {
    const digits = phoneNumber.replace(/[\s()-]/g, '');
    const e164 = digits.startsWith('+') ? digits : '+91' + digits;

    if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
      setAuthError('Enter a valid mobile number or a 10-digit Indian number.');
      return;
    }

    setAuthBusy(true);
    setAuthError('');

    try {
      if (Platform.OS === 'web') {
        let verifier = webRecaptchaRef.current;
        if (!verifier) {
          verifier = new RecaptchaVerifier(auth, 'veer-phone-recaptcha', {
            size: 'normal'
          });
          webRecaptchaRef.current = verifier;
        }
        phoneConfirmationRef.current = await signInWithPhoneNumber(auth, e164, verifier);
      } else {
        phoneConfirmationRef.current = await nativeAuth().signInWithPhoneNumber(e164);
      }

      setPhoneNumber(e164);
      setPhoneOtpSent(true);
      setAuthError('OTP sent. Check your phone.');
    } catch (error) {
      if (webRecaptchaRef.current) {
        try { webRecaptchaRef.current.clear(); } catch (_) {}
        webRecaptchaRef.current = null;
      }
      const messages = {
        'auth/invalid-phone-number': 'Please enter a valid mobile number.',
        'auth/too-many-requests': 'Too many attempts. Please try later.',
        'auth/quota-exceeded': 'SMS quota exceeded. Please try later.',
        'auth/captcha-check-failed': 'reCAPTCHA verification failed. Please try again.',
        'auth/network-request-failed': 'Network error. Check your internet connection.'
      };
      setAuthError(messages[error.code] || ('OTP error: ' + (error.code || error.name || 'unknown') + '. ' + (error.message || '')));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    const code = phoneOtp.trim();
    if (!/^\d{6}$/.test(code)) {
      setAuthError('Enter the 6-digit OTP.');
      return;
    }
    if (!phoneConfirmationRef.current) {
      setAuthError('Please request a new OTP first.');
      return;
    }

    setAuthBusy(true);
    setAuthError('');
    try {
      if (Platform.OS === 'web') {
        await phoneConfirmationRef.current.confirm(code);
      } else {
        const credential = await phoneConfirmationRef.current.confirm(code);
        const idToken = await credential.user.getIdToken();
        const response = await fetch(ARTICLES_API + '/auth/native-phone-custom-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken })
        });
        const data = await response.json();
        if (!response.ok || !data.customToken) {
          throw new Error(data.error || 'Phone login could not be completed.');
        }
        await signInWithCustomToken(auth, data.customToken);
      }
      setPhoneOtp('');
      setPhoneOtpSent(false);
      phoneConfirmationRef.current = null;
      setAuthError('');
    } catch (error) {
      const messages = {
        'auth/invalid-verification-code': 'Incorrect OTP. Please try again.',
        'auth/code-expired': 'OTP expired. Please request a new one.',
        'auth/session-expired': 'OTP session expired. Please request a new one.'
      };
      setAuthError(messages[error.code] || error.message || 'OTP verification failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  if (authLoading) {
    return (
      <View style={{flex:1,backgroundColor:"#FFFFFF",justifyContent:"center",alignItems:"center"}}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={{width:224,height:224,justifyContent:'center',alignItems:'center'}}>
          <Animated.View
            style={{
              position:'absolute',
              width:224,
              height:224,
              borderRadius:112,
              borderWidth:4,
              borderColor:'#2563EB',
              borderTopColor:'transparent',
              transform:[{
                rotate:loadingSpin.interpolate({
                  inputRange:[0,1],
                  outputRange:['0deg','360deg']
                })
              }]
            }}
          />
          <Image
            source={require('./assets/slideshow/SSC.png')}
            style={{width:200,height:200,borderRadius:100,resizeMode:'cover'}}
          />
        </View>
      </View>
    );
  }

  if (showAccountSuccess) {
    return (
      <View style={{
        flex:1,
        backgroundColor:'#F3F6FC',
        alignItems:'center',
        justifyContent:'center',
        paddingHorizontal:22,
        paddingTop:insets.top + 20,
        paddingBottom:insets.bottom + 20,
        overflow:'hidden'
      }}>
        <StatusBar barStyle="dark-content" backgroundColor="#F3F6FC" />

        <View style={{position:'absolute',top:'12%',left:24}}>
          <Text style={{fontSize:28,color:'#60A5FA'}}>✦</Text>
        </View>
        <View style={{position:'absolute',top:'19%',right:30}}>
          <Text style={{fontSize:23,color:'#F59E0B'}}>✧</Text>
        </View>
        <View style={{position:'absolute',bottom:'17%',left:35}}>
          <Text style={{fontSize:25,color:'#818CF8'}}>✦</Text>
        </View>
        <View style={{position:'absolute',bottom:'23%',right:25}}>
          <Text style={{fontSize:28,color:'#34D399'}}>✧</Text>
        </View>

        <View style={{alignItems:'center',marginBottom:25}}>
          <Image
            source={require('./assets/icon.png')}
            style={{width:66,height:66,borderRadius:18,marginBottom:10}}
            resizeMode="contain"
          />
          <Text style={{fontSize:21,fontWeight:'900',letterSpacing:1,color:'#173B83'}}>
            STUDY WITH VEER
          </Text>
          <Text style={{fontSize:12,color:'#64748B',marginTop:5}}>
            SUCCESS STARTS HERE
          </Text>
        </View>

        <Animated.View style={{
          width:'100%',
          maxWidth:420,
          opacity:successFade,
          transform:[{scale:successScale}]
        }}>
          <View style={{
            backgroundColor:'#173B83',
            borderRadius:30,
            padding:7,
            paddingBottom:13,
            shadowColor:'#173B83',
            shadowOffset:{width:0,height:13},
            shadowOpacity:0.25,
            shadowRadius:18,
            elevation:14
          }}>
            <View style={{
              backgroundColor:'#FFFFFF',
              borderRadius:24,
              paddingHorizontal:22,
              paddingTop:29,
              paddingBottom:23,
              alignItems:'center',
              borderWidth:1,
              borderColor:'#DCE7FA'
            }}>
              <View style={{
                width:112,
                height:112,
                borderRadius:56,
                backgroundColor:'#DBEAFE',
                alignItems:'center',
                justifyContent:'center',
                marginBottom:20,
                borderWidth:5,
                borderColor:'#BFDBFE',
                elevation:8,
                shadowColor:'#2563EB',
                shadowOffset:{width:0,height:6},
                shadowOpacity:0.22,
                shadowRadius:9
              }}>
                <View style={{
                  width:82,
                  height:82,
                  borderRadius:41,
                  backgroundColor:'#16A34A',
                  alignItems:'center',
                  justifyContent:'center',
                  borderWidth:4,
                  borderColor:'#86EFAC',
                  elevation:7
                }}>
                  <Feather name="check" size={49} color="#FFFFFF" />
                </View>
              </View>

              <Text style={{
                fontSize:25,
                fontWeight:'900',
                color:'#173B83',
                textAlign:'center'
              }}>
                Congratulations, {accountSuccessName || fullName.trim()}!
              </Text>
              <Text style={{
                fontSize:18,
                fontWeight:'800',
                color:'#16A34A',
                marginTop:7,
                textAlign:'center'
              }}>
                Account Created!
              </Text>
              <Text style={{
                fontSize:13,
                lineHeight:20,
                color:'#64748B',
                textAlign:'center',
                marginTop:9,
                marginBottom:21
              }}>
                Welcome to STUDY WITH VEER, {accountSuccessName || fullName.trim()}. Your learning journey starts now!
              </Text>

              <View style={{
                width:'100%',
                backgroundColor:'#F0FDF4',
                borderRadius:16,
                padding:14,
                marginBottom:21,
                borderWidth:1,
                borderColor:'#BBF7D0'
              }}>
                {[
                  'Account created successfully',
                  'Password requirements verified',
                  'Ready to start learning'
                ].map(item => (
                  <View key={item} style={{
                    flexDirection:'row',
                    alignItems:'center',
                    marginVertical:6
                  }}>
                    <Feather name="check-circle" size={17} color="#16A34A" />
                    <Text style={{
                      marginLeft:9,
                      fontSize:12,
                      color:'#166534',
                      flex:1
                    }}>
                      {item}
                    </Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                onPress={() => {
                  setShowAccountSuccess(false);
                  setIsCreatingAccount(false);
                  setPassword('');
                  setAuthError('');
                }}
                activeOpacity={0.85}
                style={{
                  width:'100%',
                  minHeight:54,
                  borderRadius:28,
                  backgroundColor:'#173B83',
                  alignItems:'center',
                  justifyContent:'center',
                  flexDirection:'row',
                  elevation:5,
                  shadowColor:'#173B83',
                  shadowOffset:{width:0,height:4},
                  shadowOpacity:0.2,
                  shadowRadius:5
                }}
              >
                <Text style={{
                  color:'#FFFFFF',
                  fontSize:13,
                  fontWeight:'900',
                  letterSpacing:1.3
                }}>
                  CONTINUE TO LOGIN
                </Text>
                <Feather name="arrow-right" size={19} color="#FFFFFF" style={{marginLeft:9}} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        <Text style={{
          fontSize:12,
          color:'#64748B',
          marginTop:22,
          textAlign:'center'
        }}>
          Every expert was once a beginner.
        </Text>
      </View>
    );
  }

  if (!loggedIn) {
    return (
      <View style={{flex:1, backgroundColor:pageBg, justifyContent:'center', paddingHorizontal:22, paddingVertical:24}}>
        <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} backgroundColor={pageBg} />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{flexGrow:1, justifyContent:'center'}}
          showsVerticalScrollIndicator={false}
        >

          <View style={{alignItems:'center', marginBottom:18}}>
            <TouchableOpacity onPress={() => setDarkMode(v => !v)} style={{alignSelf:'flex-end', backgroundColor:cardBg, borderWidth:1, borderColor:darkMode ? '#334155' : '#DCE5F5', paddingHorizontal:14, paddingVertical:9, borderRadius:20, marginBottom:18}}><Text style={{color:mainText,fontSize:13,fontWeight:'800'}}>{darkMode ? t('☀️ Light Mode', '☀️ లైట్ మోడ్') : t('🌙 Dark Mode', '🌙 డార్క్ మోడ్')}</Text></TouchableOpacity>
            <Image
              source={require('./assets/icon.png')}
              style={{width:100, height:100, borderRadius:22, marginBottom:14}}
              resizeMode="contain"
            />
            <Text style={{fontSize:25, fontWeight:'900', color:darkMode?'#FFFFFF':'#173B83', letterSpacing:0.5}}>
              STUDY WITH VEER
            </Text>
            <Text style={{fontSize:13, color:'#64748B', marginTop:6}}>
              {t('Your Success Starts Here', 'మీ విజయం ఇక్కడే మొదలవుతుంది')}
            </Text>
            <Text style={{fontSize:16, fontWeight:'900', fontStyle:'italic', color:darkMode?'#E2E8F0':'#173B83', textAlign:'center', marginTop:14, lineHeight:24}}>
              {t('Every Expert Was Once a Beginner.', 'ప్రతి నిపుణుడు ఒకప్పుడు ప్రారంభకుడే.')}
            </Text>
          </View>

          <Animated.View nativeID="veer-auth-card" style={{position:'relative',borderRadius:24,padding:4,backgroundColor:'#EF4444',overflow:'hidden',borderWidth:3,borderColor:heroSpin.interpolate({inputRange:[0,0.5,1],outputRange:['#FF1744','#FF6B6B','#B91C1C']}),shadowColor:heroSpin.interpolate({inputRange:[0,0.5,1],outputRange:['#FF1744','#FF6B6B','#B91C1C']}),shadowOffset:{width:0,height:0},shadowOpacity:0.9,shadowRadius:12,elevation:10}}>
            <View style={{position:'relative',zIndex:1,backgroundColor:cardBg,borderRadius:21,padding:22,borderWidth:1,borderColor:darkMode?'#334155':'#FFFFFF'}}>
            <Text style={{fontSize:25, fontWeight:'800', color:mainText}}>
              {isCreatingAccount ? t('Create Account', 'ఖాతా సృష్టించండి') : t('Welcome Back!', 'తిరిగి స్వాగతం!')}
            </Text>
            <Text style={{fontSize:13, color:'#64748B', marginTop:7, marginBottom:23}}>
              {isCreatingAccount ? t('Create your account and start preparing', 'మీ ఖాతాను సృష్టించి సిద్ధం కావడం ప్రారంభించండి') : t('Login to continue your preparation', 'మీ ప్రిపరేషన్ కొనసాగించడానికి లాగిన్ అవ్వండి')}
            </Text>


            <TouchableOpacity
              disabled={authBusy || isCreatingAccount}
              onPress={() => {
                setPhoneLoginMode(v => !v);
                setPhoneOtpSent(false);
                setPhoneOtp('');
                phoneConfirmationRef.current = null;
                setAuthError('');
                if (webRecaptchaRef.current) {
                  try { webRecaptchaRef.current.clear(); } catch (_) {}
                  webRecaptchaRef.current = null;
                }
              }}
              style={{marginBottom:16,paddingVertical:11,borderRadius:14,borderWidth:1,borderColor:'#B9C9E8',alignItems:'center'}}
            >
              <Text style={{color:'#2457D6',fontWeight:'800'}}>
                {phoneLoginMode ? t('Use Email Login', 'ఈమెయిల్ లాగిన్ ఉపయోగించండి') : t('Login with Mobile OTP', 'మొబైల్ OTPతో లాగిన్')}
              </Text>
            </TouchableOpacity>

            {phoneLoginMode && (
              <View style={{marginBottom:18}}>
                <Text style={{fontSize:13,color:mutedText,marginBottom:8}}>
                  {t('Enter 10-digit Indian mobile number or include country code.', '10 అంకెల మొబైల్ నంబర్ ఇవ్వండి.')}
                </Text>
                <TextInput
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  editable={!phoneOtpSent && !authBusy}
                  placeholder={t('Mobile number', 'మొబైల్ నంబర్')}
                  placeholderTextColor={mutedText}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  style={{borderWidth:1.5,borderColor:'#87CEFA',borderRadius:10,paddingHorizontal:14,paddingVertical:12,fontSize:17,color:mainText,marginBottom:12,backgroundColor:cardBg}}
                />
                {phoneOtpSent && (
                  <TextInput
                    value={phoneOtp}
                    onChangeText={v => setPhoneOtp(v.replace(/\D/g, '').slice(0,6))}
                    placeholder={t('Enter 6-digit OTP', '6 అంకెల OTP నమోదు చేయండి')}
                    placeholderTextColor={mutedText}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    maxLength={6}
                    style={{borderBottomWidth:2,borderBottomColor:'#87CEFA',paddingVertical:12,fontSize:17,color:mainText,marginBottom:12}}
                  />
                )}
                {Platform.OS === 'web' && (
                  <View nativeID="veer-phone-recaptcha" style={{marginBottom:12}} />
                )}
                <TouchableOpacity
                  onPress={phoneOtpSent ? handleVerifyPhoneOtp : handleSendPhoneOtp}
                  disabled={authBusy}
                  style={{backgroundColor:'#173B83',paddingVertical:14,borderRadius:30,alignItems:'center',marginBottom:8}}
                >
                  <Text style={{color:'#FFFFFF',fontWeight:'800'}}>
                    {authBusy ? t('PLEASE WAIT...', 'దయచేసి వేచి ఉండండి...') : phoneOtpSent ? t('VERIFY OTP & LOGIN', 'OTP ధృవీకరించి లాగిన్') : t('SEND OTP', 'OTP పంపండి')}
                  </Text>
                </TouchableOpacity>
                {phoneOtpSent && (
                  <TouchableOpacity
                    disabled={authBusy}
                    onPress={() => {
                      setPhoneOtpSent(false);
                      setPhoneOtp('');
                      phoneConfirmationRef.current = null;
                      if (webRecaptchaRef.current) {
                        try { webRecaptchaRef.current.clear(); } catch (_) {}
                        webRecaptchaRef.current = null;
                      }
                      setAuthError('');
                    }}
                    style={{alignItems:'center',padding:8}}
                  >
                    <Text style={{color:'#2457D6',fontWeight:'700'}}>
                      {t('Change number / resend OTP', 'నంబర్ మార్చండి / OTP మళ్లీ పంపండి')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {isCreatingAccount && !phoneLoginMode && (
            <View style={{marginBottom:22, paddingTop:10}}>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  onFocus={() => setFullNameFocused(true)}
                  onBlur={() => setFullNameFocused(false)}
                  placeholder=""
                  placeholderTextColor={mutedText}
                  autoCapitalize="words"
                  autoCorrect={false}
                  style={{backgroundColor:'transparent',borderWidth:0,outlineStyle:'none',borderColor:'transparent',borderBottomWidth:2,borderBottomColor:(fullNameFocused || fullName) ? '#87CEFA' : '#DCE3F0',paddingHorizontal:0,paddingTop:15,paddingBottom:10,fontSize:18,color:mainText}}
                />
                <View pointerEvents="none" style={{position:'absolute',left:0,top:15,flexDirection:'row'}}>
                  {'Full Name'.split('').map((letter,index) => (
                    <Animated.Text key={index} style={{fontSize:18,minWidth:letter === ' ' ? 5 : 5,color:(fullNameFocused || fullName) ? '#38BDF8' : mutedText,transform:[{translateY:fullNameLetterAnims[index].interpolate({inputRange:[0,1],outputRange:[0,-30]})}]}}>{letter}</Animated.Text>
                  ))}
                </View>
              </View>
            )}

            {!phoneLoginMode && (
            <>
            <View style={{marginBottom:22, paddingTop:10}}>
              <TextInput
                style={{backgroundColor:'transparent', borderWidth:0, outlineStyle:'none', borderColor:'transparent', borderBottomWidth:2, borderBottomColor:(emailFocused || email) ? '#87CEFA' : '#DCE3F0', paddingHorizontal:0, paddingTop:15, paddingBottom:10, fontSize:18, color:mainText}}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                underlineColorAndroid="transparent"
              />
              <View pointerEvents="none" style={{position:'absolute', left:0, top:15, flexDirection:'row'}}>
                {'Email'.split('').map((letter,index) => (
                  <Animated.Text key={index} style={{fontSize:18,minWidth:5,color:(emailFocused || email) ? '#38BDF8' : mutedText,transform:[{translateY:emailLetterAnims[index].interpolate({inputRange:[0,1],outputRange:[0,-30]})}]}}>{letter}</Animated.Text>
                ))}
              </View>
            </View>

            <View style={{marginBottom:18, paddingTop:10, flexDirection:'row', alignItems:'center', borderBottomWidth:2, borderBottomColor:(passwordFocused || password) ? '#87CEFA' : '#DCE3F0'}}>
              <View style={{flex:1, position:'relative'}}>
                <TextInput
                  style={{backgroundColor:'transparent', borderWidth:0, outlineStyle:'none', borderColor:'transparent', paddingHorizontal:0, paddingTop:15, paddingBottom:10, fontSize:18, color:mainText}}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  underlineColorAndroid="transparent"
                />
                <View pointerEvents="none" style={{position:'absolute', left:0, top:15, flexDirection:'row'}}>
                  {'Password'.split('').map((letter,index) => (
                    <Animated.Text key={index} style={{fontSize:18,minWidth:5,color:(passwordFocused || password) ? '#38BDF8' : mutedText,transform:[{translateY:passwordLetterAnims[index].interpolate({inputRange:[0,1],outputRange:[0,-30]})}]}}>{letter}</Animated.Text>
                  ))}
                </View>
              </View>
              <Feather name="shield" size={18} color="#2455B8" style={{marginRight:6}} />
              <TouchableOpacity
                onPress={() => setShowPassword(v => !v)}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                style={{padding:8}}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={21} color="#2455B8" />
              </TouchableOpacity>
            </View>

            {!isCreatingAccount && (
              <TouchableOpacity
                onPress={handlePasswordReset}
                disabled={authBusy}
                activeOpacity={0.7}
                style={{alignSelf:'flex-end',marginTop:-7,marginBottom:15,paddingVertical:6}}
              >
                <Text style={{fontSize:13,fontWeight:'800',color:'#2457D6'}}>
                  {t('Forgot Password?', 'పాస్‌వర్డ్ మర్చిపోయారా?')}
                </Text>
              </TouchableOpacity>
            )}

            {isCreatingAccount && (
              <View style={{marginTop:-8, marginBottom:14}}>
                {passwordChecks.map(rule => (
                  <View key={rule.label} style={{flexDirection:'row', alignItems:'center', marginBottom:5}}>
                    <Feather
                      name={rule.valid ? 'check-circle' : 'circle'}
                      size={14}
                      color={rule.valid ? '#16A34A' : '#94A3B8'}
                    />
                    <Text style={{marginLeft:7, fontSize:12, color:rule.valid ? '#16A34A' : mutedText}}>
                      {rule.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            </>
            )}

            {!!authError && (
              <Text style={{color:'#C62828', fontSize:12, marginBottom:12}}>
                {authError}
              </Text>
            )}

            {!phoneLoginMode && (
            <>
            <TouchableOpacity
              nativeID="veer-login-space" className="veer-space-btn"
              onPress={handleAuth}
              disabled={authBusy}
              style={{backgroundColor:'#173B83',borderWidth:2,borderColor:heroSpin.interpolate({inputRange:[0,0.5,1],outputRange:['#FF1744','#FF6B6B','#B91C1C']}),shadowColor:'#173B83',shadowOffset:{width:0,height:4},shadowOpacity:0.35,shadowRadius:7,elevation:6,paddingVertical:15,borderRadius:50,alignItems:'center',justifyContent:'center',marginTop:8,minHeight:54,position:'relative',overflow:'hidden'}}
            >
              <View className="veer-space-content" style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9}}>
                {!authBusy && !isCreatingAccount && <Feather name="shield" size={20} color="#FFFFFF" />}
                <Text className="veer-space-text" style={{color:'#FFFFFF',fontWeight:'800',fontSize:13,letterSpacing:3}}>
                  {authBusy ? t('PLEASE WAIT...', 'దయచేసి వేచి ఉండండి...') : (isCreatingAccount ? t('CREATE ACCOUNT', 'ఖాతా సృష్టించండి') : t('LOGIN', 'లాగిన్'))}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              className="veer-space-btn"
              disabled={authBusy}
              onPress={() => {
                setIsCreatingAccount(v => !v);
                setAuthError('');
                setShowPassword(false);
              }}
              style={{backgroundColor:'#173B83',borderWidth:2,borderColor:heroSpin.interpolate({inputRange:[0,0.5,1],outputRange:['#FF1744','#FF6B6B','#B91C1C']}),shadowColor:'#173B83',shadowOffset:{width:0,height:4},shadowOpacity:0.35,shadowRadius:7,elevation:6,marginTop:16,paddingVertical:12,borderRadius:50,alignItems:'center',justifyContent:'center',minHeight:50,position:'relative',overflow:'hidden'}}
            >
              <View className="veer-space-content" style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9}}>
                <Text className="veer-space-text" style={{color:'#FFFFFF',fontWeight:'800',fontSize:12,letterSpacing:2}}>
                  {isCreatingAccount ? t('BACK TO LOGIN', 'లాగిన్‌కు తిరిగి') : t('CREATE ACCOUNT', 'ఖాతా సృష్టించండి')}
                </Text>
              </View>
            </TouchableOpacity>
            </>
            )}
            </View>
          </Animated.View>

          <Text style={{textAlign:'center', color:'#718096', fontSize:12, marginTop:20}}>
            {t('Prepare  •  Practice  •  Succeed', 'సిద్ధం అవ్వండి  •  సాధన చేయండి  •  విజయం సాధించండి')}
          </Text>
          <View style={{alignSelf:'center', flexDirection:'row', width:210, marginTop:14, marginBottom:8, borderRadius:24, padding:3, backgroundColor:cardBg, borderWidth:1, borderColor:darkMode ? '#334155' : '#DCE5F5'}}>
            <TouchableOpacity onPress={() => changeLanguage('en')} style={{flex:1, alignItems:'center', justifyContent:'center', paddingVertical:10, borderRadius:21, backgroundColor:language === 'en' ? '#173B83' : 'transparent'}}>
              <Text style={{fontSize:13, fontWeight:'800', color:language === 'en' ? '#FFFFFF' : mainText}}>English</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => changeLanguage('te')} style={{flex:1, alignItems:'center', justifyContent:'center', paddingVertical:10, borderRadius:21, backgroundColor:language === 'te' ? '#173B83' : 'transparent'}}>
              <Text style={{fontSize:13, fontWeight:'800', color:language === 'te' ? '#FFFFFF' : mainText}}>తెలుగు</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  const navItems = [
    ['Home', 'home', '#2457D6'],
    ['My Courses', 'book-open', '#9333EA'],
    ['Live Classes', 'radio', '#E11D48'],
    ['Chat', 'message-circle', '#10B981'],
    ['Downloads', 'download', '#2563EB']
  ];

  return (
    <View style={[styles.app, {backgroundColor:pageBg}]}>
      <StatusBar barStyle="light-content" backgroundColor={BLUE} />

      <View style={{backgroundColor:darkMode?'#0B1730':'#F3EEFF',paddingTop:12,paddingHorizontal:14,paddingBottom:14,borderBottomWidth:1,borderBottomColor:darkMode?'#263858':'#E2D6FF'}}>
        <View style={{flexDirection:'row',alignItems:'center',minHeight:54}}>
          <TouchableOpacity
            onPress={() => setMenuOpen(v => !v)}
            activeOpacity={0.75}
            style={{width:46,height:46,alignItems:'center',justifyContent:'center',borderRadius:15,backgroundColor:darkMode?'#1A2A49':'#E9DEFF',borderWidth:1,borderColor:darkMode?'#34496C':'#D8C8FF',marginRight:11}}
          >
            <Feather name={menuOpen ? 'x' : 'menu'} size={24} color={darkMode?'#FFFFFF':'#35245C'} />
          </TouchableOpacity>

          <View style={{flex:1}}>
            <Text style={{fontSize:10,fontWeight:'900',color:'#7952C7',letterSpacing:1.5}}>{t('WELCOME TO', 'స్వాగతం')}</Text>
            <Text numberOfLines={1} style={{fontSize:16,fontWeight:'900',color:'#35245C',letterSpacing:2}}>{(auth.currentUser?.displayName?.trim() || auth.currentUser?.email?.split('@')[0] || 'Student').toUpperCase().split('').join(' ')}</Text>
            <Text style={{fontSize:10,color:'#766A91',marginTop:2}}>{t('Prepare  •  Practice  •  Succeed', 'సిద్ధం అవ్వండి  •  సాధన చేయండి  •  విజయం సాధించండి')}</Text>
          </View>

          <TouchableOpacity
            onPress={() => { setSearchQuery(''); setSearchOpen(true); }}
            activeOpacity={0.75}
            style={{width:42,height:42,alignItems:'center',justifyContent:'center',borderRadius:14,backgroundColor:'#E9DEFF',borderWidth:0,borderColor:'transparent',marginRight:8}}
          >
            <Text style={{fontSize:25,color:'#35245C'}}>⌕</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setMenuOpen(false); setPage('Notifications'); }}
            activeOpacity={0.75}
            accessibilityLabel="Open notifications"
            style={{width:42,height:42,alignItems:'center',justifyContent:'center',borderRadius:14,backgroundColor:'#E9DEFF',borderWidth:0,borderColor:'transparent'}}
          >
            <Text style={{fontSize:20,color:'#FFD77A'}}>🔔</Text>
            {unreadNotifications > 0 && (
              <View style={{position:'absolute',top:1,right:0,minWidth:17,height:17,paddingHorizontal:4,borderRadius:9,backgroundColor:'#FF5364',alignItems:'center',justifyContent:'center'}}>
                <Text style={{fontSize:10,color:'#FFFFFF',fontWeight:'900'}}>
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

{!menuOpen && (
        <View style={{flexDirection:'row',backgroundColor:'#FFFFFF',borderRadius:17,padding:5,marginTop:14,borderWidth:1,borderColor:'#E2D6FF'}}>
          <TouchableOpacity
            onPress={() => setPage('Courses')}
            activeOpacity={0.8}
            style={{flex:1,flexDirection:'row',paddingVertical:12,alignItems:'center',justifyContent:'center',backgroundColor:page==='Courses'?'#E9DEFF':'transparent',borderRadius:12,borderWidth:page==='Courses'?1:0,borderColor:'#C4AEFF'}}
          >
            <Text style={{color:'#173B83',fontWeight:'800',fontSize:13}}>{t('VEER Classes', 'వీర్ తరగతులు')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPage('Mock Test Folders')}
            activeOpacity={0.8}
            style={{flex:1,flexDirection:'row',paddingVertical:12,alignItems:'center',justifyContent:'center',backgroundColor:page==='Mock Test Folders'?'#E9DEFF':'transparent',borderRadius:12,borderWidth:page==='Mock Test Folders'?1:0,borderColor:'#C4AEFF'}}
          >
            <Text style={{color:'#35245C',fontWeight:'800',fontSize:13}}>{t('VEER Tests', 'వీర్ పరీక్షలు')}</Text>
          </TouchableOpacity>
        </View>
        )}
      </View>

      {menuOpen && (
        <View style={{
          backgroundColor:darkMode?'#101B32':'#FFFFFF',
          marginHorizontal:12,marginTop:8,marginBottom:10,
          borderRadius:22,padding:15,
          borderWidth:1,borderColor:darkMode?'#293B5B':'#E2D6FF',
          elevation:5,shadowColor:'#6D5BA6',shadowOpacity:0.12,
          shadowRadius:10,shadowOffset:{width:0,height:4}
        }}>
          <View style={{flexDirection:'row',alignItems:'center',marginBottom:15}}>
            <View style={{
              width:58,height:58,borderRadius:29,
              backgroundColor:darkMode?'#263254':'#E9DEFF',
              borderWidth:2,borderColor:darkMode?'#5B6594':'#C9B6FF',
              alignItems:'center',justifyContent:'center',marginRight:12
            }}>
              <Image source={require("./assets/images/book1.png")} style={{width:38,height:38,resizeMode:"contain"}} />
            </View>
            <View style={{flex:1}}>
              <Text style={{fontSize:10,fontWeight:'900',color:darkMode?'#C5B3FF':'#7952C7',letterSpacing:1.4}}>{t('WELCOME TO', 'స్వాగతం')}</Text>
              <Text numberOfLines={1} style={{fontSize:17,fontWeight:'900',color:darkMode?'#FFFFFF':'#35245C',letterSpacing:1}}>{(auth.currentUser?.displayName?.trim() || auth.currentUser?.email?.split('@')[0] || 'Student').toUpperCase().split('').join(' ')}</Text>
              <Text style={{fontSize:11,color:darkMode?'#B7C9E8':'#61738F',marginTop:3}}>{t('Prepare  •  Practice  •  Succeed', 'సిద్ధం అవ్వండి  •  సాధన చేయండి  •  విజయం సాధించండి')}</Text>
            </View>
            <TouchableOpacity onPress={() => setMenuOpen(false)} style={{
              width:34,height:34,borderRadius:12,alignItems:'center',
              justifyContent:'center',backgroundColor:darkMode?'#14294A':'#EDF3FC'
            }}>
              <Text style={{fontSize:20,color:darkMode?'#FFFFFF':'#173B70'}}>✕</Text>
            </TouchableOpacity>
          </View>

          {[
            {title:t('MAIN MENU','ప్రధాన మెనూ'),items:navItems},
          ].map((section,index) => (
            <View key={section.title} style={{marginBottom: index===0?10:4}}>
              <Text style={{
                fontSize:11,fontWeight:'900',letterSpacing:1.3,
                color:darkMode?'#C5B3FF':'#7952C7',marginBottom:8,marginLeft:4
              }}>{section.title}</Text>
              {section.items.map(([name,symbol,iconColor]) => {
                const destination = ['Mock Tests','Previous Year Papers'].includes(name)
                  ? 'Mock Test Folders'
                  : ['My Purchases','Paid Courses','Free Courses'].includes(name)
                    ? (name === 'Paid Courses' ? 'Paid Courses' : 'Courses') : name;
                const active = page===name || page===destination;
                return (
                  <TouchableOpacity key={name}
                    activeOpacity={0.75}
                    onPress={() => {
                      setPage(destination);
                      setMenuOpen(false);
                    }}
                    style={{
                      flexDirection:'row',alignItems:'center',
                      paddingVertical:12,paddingHorizontal:11,
                      borderRadius:13,marginBottom:4,
                      backgroundColor:active
                        ? (darkMode?'#30254F':'#F0E9FF')
                        : 'transparent',
                      borderWidth:active?1.2:1,
                      borderColor:active?(darkMode?'#7962B5':'#D2C0FF'):'transparent'
                    }}>
                    <View style={{
                      width:35,height:35,borderRadius:11,
                      alignItems:'center',justifyContent:'center',
                      backgroundColor:active
                        ? (darkMode?'#45376C':'#E2D6FF')
                        : (darkMode?'#18345C':'#E4EDFA'),
                      borderWidth:1,
                      borderColor:'transparent',
                      marginRight:11
                    }}>
                      <Feather name={symbol} size={20} color={iconColor || (darkMode?'#FFFFFF':'#163D78')} />
                    </View>
                    <Text style={{
                      flex:1,fontSize:14,fontWeight:active?'900':'700',
                      color:active?(darkMode?'#FFFFFF':'#12366B'):(darkMode?'#E4EDFF':'#183153')
                    }}>{t(name, ({Home:'హోమ్','My Courses':'నా కోర్సులు','Live Classes':'లైవ్ తరగతులు',Downloads:'డౌన్‌లోడ్స్'})[name] || name)}</Text>
                    <Feather name="chevron-right" size={20} color={darkMode?'#A9B8D4':'#8B82A6'} />
                  </TouchableOpacity>
                );
              })}
              {index===0 && <View style={{
                height:1,backgroundColor:darkMode?'#23436D':'#DCE7F7',
                marginTop:7,marginBottom:12
              }}/>}
            </View>
          ))}

          <View style={{
            height:1,backgroundColor:darkMode?'#23436D':'#DCE7F7',
            marginTop:7,marginBottom:12
          }}/>

          <View style={{padding:12,marginBottom:14,borderRadius:15,backgroundColor:darkMode?'#102441':'#F0F5FC',borderWidth:1,borderColor:darkMode?'#29446E':'#DCE7F7'}}>
            <Text style={{fontSize:13,fontWeight:'800',color:darkMode?'#FFFFFF':'#173B70',marginBottom:9}}>{t('Language','భాష')}</Text>
            <View style={{flexDirection:'row',gap:8}}>
              <TouchableOpacity onPress={() => changeLanguage('en')} style={{flex:1,alignItems:'center',paddingVertical:10,borderRadius:10,backgroundColor:language==='en'?'#7952C7':'transparent',borderWidth:1,borderColor:language==='en'?'#7952C7':(darkMode?'#40516F':'#D8C8FF')}}>
                <Text style={{fontSize:13,fontWeight:'800',color:language==='en'?'#FFFFFF':(darkMode?'#E4EDFF':'#183153')}}>English</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => changeLanguage('te')} style={{flex:1,alignItems:'center',paddingVertical:10,borderRadius:10,backgroundColor:language==='te'?'#7952C7':'transparent',borderWidth:1,borderColor:language==='te'?'#7952C7':(darkMode?'#40516F':'#D8C8FF')}}>
                <Text style={{fontSize:13,fontWeight:'800',color:language==='te'?'#FFFFFF':(darkMode?'#E4EDFF':'#183153')}}>తెలుగు</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={{fontSize:11,fontWeight:'900',letterSpacing:1.3,color:'#25BFFF',marginBottom:8,marginLeft:4}}>ACCOUNT</Text>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={async () => {
              setMenuOpen(false);
              try {
                await signOut(auth);
                setPage('Home');
              } catch (error) {
                console.log('Logout failed:',error);
              }
            }}
            style={{
              flexDirection:'row',
              alignItems:'center',
              minHeight:56,
              paddingHorizontal:11,
              paddingVertical:9,
              marginTop:-25,
              borderRadius:15,
              backgroundColor:darkMode?'#3A1728':'#FFF0F2',
              borderWidth:1.5,
              borderColor:darkMode?'#E34D72':'#F2A1B0',
              elevation:3
            }}>
            <View style={{
              width:35,height:35,borderRadius:11,
              backgroundColor:darkMode?'#67233A':'#FFDDE3',
              alignItems:'center',justifyContent:'center',
              marginRight:11
            }}>
              <Text style={{fontSize:22,color:darkMode?'#FFB3C3':'#C32643'}}>↪</Text>
            </View>
            <View style={{flex:1}}>
              <Text style={{
                fontSize:15,fontWeight:'900',
                color:darkMode?'#FFC0CE':'#B91C43'
              }}>Logout</Text>
              <Text style={{
                fontSize:10,marginTop:2,
                color:darkMode?'#E7A6B7':'#A34A60'
              }}>Sign out of your account</Text>
            </View>
            <Text style={{
              fontSize:23,fontWeight:'900',
              color:darkMode?'#FFB3C3':'#C32643'
            }}>→</Text>
          </TouchableOpacity>

          <Text style={{
            textAlign:'center',fontSize:11,fontStyle:'italic',
            color:darkMode?'#91ACD5':'#7185A4',marginTop:15
          }}>Together Towards Your Success ✨</Text>
        </View>
      )}


{searchOpen && (
  <View style={{
    position:'absolute',top:0,bottom:0,left:0,right:0,
    zIndex:999,elevation:25,backgroundColor:pageBg,padding:16
  }}>
    <View style={{flexDirection:'row',alignItems:'center',marginBottom:16}}>
      <Text style={{fontSize:22,fontWeight:'900',color:darkMode?'#FFFFFF':'#173B83',flex:1}}>
        Search STUDY WITH VEER
      </Text>
      <TouchableOpacity onPress={() => setSearchOpen(false)}
        style={{padding:10,borderRadius:12,backgroundColor:darkMode?'#243650':'#E9DEFF'}}>
        <Text style={{fontSize:20,fontWeight:'900',color:darkMode?'#FFFFFF':'#35245C'}}>✕</Text>
      </TouchableOpacity>
    </View>

    <View style={{
      flexDirection:'row',alignItems:'center',borderRadius:15,
      borderWidth:1.5,borderColor:'#8B6BE8',paddingHorizontal:12,
      backgroundColor:darkMode?'#10213A':'#FFFFFF',marginBottom:15
    }}>
      <Text style={{fontSize:22,color:'#8B6BE8',marginRight:8}}>⌕</Text>
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search Maths, Reasoning, PYQ..."
        placeholderTextColor={darkMode?'#A9B8D0':'#7B8497'}
        autoFocus
        selectionColor="#8B6BE8"
        underlineColorAndroid="transparent"
        style={{flex:1,paddingVertical:14,color:darkMode?'#FFFFFF':'#172B4D',fontSize:15,borderWidth:0,outlineWidth:0,outlineStyle:'none',backgroundColor:'transparent'}}
      />
      {!!searchQuery && (
        <TouchableOpacity onPress={() => setSearchQuery('')}>
          <Text style={{fontSize:19,color:darkMode?'#FFFFFF':'#173B83'}}>✕</Text>
        </TouchableOpacity>
      )}
    </View>

    <Text style={{fontSize:12,fontWeight:'800',color:darkMode?'#B8C8E0':'#687795',marginBottom:9}}>
      'SEARCH RESULTS'
    </Text>

    {!!searchQuery.trim() && (
    <ScrollView keyboardShouldPersistTaps="handled">
      {([
        {title:'Mathematics / Maths',keywords:'maths mathematics arithmetic quant practice numbers',page:'Quant Practice'},
        {title:'Quant Practice',keywords:'quant quantitative aptitude maths practice',page:'Quant Practice'},
        {title:'Reasoning',keywords:'reasoning logical verbal non verbal puzzles',page:'Mock Test Folders'},
        {title:'English Grammar',keywords:'english grammar vocabulary synonyms antonyms',page:'Mock Test Folders'},
        {title:'General Knowledge / GS',keywords:'general knowledge gs gk history polity geography science',page:'Mock Test Folders'},
        {title:'Current Affairs 2026',keywords:'current affairs news daily affairs 2026',page:'Current Affairs 2026'},
        {title:'Previous Year Papers / PYQ',keywords:'previous year papers pyq old papers question papers',page:'Previous Year Papers'},
        {title:'SSC Papers',keywords:'ssc papers gd cgl chsl mts je cpo',page:'SSC Papers'},
        {title:'RRB Papers',keywords:'rrb papers ntpc group d alp technician railway',page:'RRB Papers'},
        {title:'TGPSC Papers',keywords:'tgpsc papers group 1 group 2 group 3 group 4',page:'TGPSC Papers'},
        {title:'Free Ebooks',keywords:'free ebooks books pdf study material',page:'Free Ebooks'},
        {title:'SSC GS',keywords:'ssc gs general science general studies science technology physics chemistry biology ebook pdf',page:'Free Ebooks'},
        {title:'SSC Quantitative Aptitude',keywords:'ssc quantitative aptitude quant arithmetic algebra geometry ebook pdf',page:'Free Ebooks'},
        {title:'SSC PureMaths',keywords:'ssc puremaths pure maths maths mathematics formula ebook pdf',page:'Free Ebooks'},
        {title:'Free Courses',keywords:'free courses free course ssc mathematics english foundation',page:'Free Courses'},
        {title:'Mock Test Folders',keywords:'mock test folders subjects practice exam tests',page:'Mock Test Folders'},
        {title:'Mock Tests',keywords:'mock tests online test exam practice',page:'Mock Test Folders'},
        {title:'Courses',keywords:'courses ssc tgpsc rrb classes',page:'Courses'},
        {title:'SSC Courses',keywords:'ssc course staff selection commission',page:'SSC Courses'},
        {title:'TGPSC Courses',keywords:'tgpsc telangana public service commission',page:'TGPSC Courses'},
        {title:'RRB Courses',keywords:'rrb railway recruitment board',page:'RRB Courses'},
        {title:'Downloads',keywords:'downloads downloaded files materials',page:'Downloads'},
        {title:'Live Classes',keywords:'live classes online classes lessons',page:'Live Classes'},
        {title:'My Progress',keywords:'my progress scores performance results',page:'My Progress'},
        {title:'Home',keywords:'home dashboard main page',page:'Home'}
      ]).filter(item => {
        const q = searchQuery.trim().toLowerCase();
        return !q || (item.title + ' ' + item.keywords).toLowerCase().includes(q);
      }).map((item) => (
        <TouchableOpacity key={item.title}
          onPress={() => {
            setPage(item.page);
            setSearchOpen(false);
            setSearchQuery('');
            setMenuOpen(false);
          }}
          activeOpacity={0.75}
          style={{
            flexDirection:'row',alignItems:'center',padding:14,
            borderRadius:13,marginBottom:8,
            backgroundColor:darkMode?'#10213A':'#FFFFFF',
            borderWidth:1,borderColor:darkMode?'#294366':'#E0D8F5'
          }}>
          <View style={{
            width:38,height:38,borderRadius:11,alignItems:'center',
            justifyContent:'center',backgroundColor:darkMode?'#24365A':'#E9DEFF',
            marginRight:11
          }}>
            <Text style={{fontSize:19,color:darkMode?'#FFFFFF':'#35245C'}}>⌕</Text>
          </View>
          <Text style={{flex:1,fontSize:14,fontWeight:'800',color:darkMode?'#FFFFFF':'#173B83'}}>
            {item.title}
          </Text>
          <Text style={{fontSize:20,color:'#8B6BE8'}}>›</Text>
        </TouchableOpacity>
      ))}
      {!!searchQuery.trim() && !([
        {title:'Mathematics / Maths',keywords:'maths mathematics arithmetic quant practice numbers'},
        {title:'Reasoning',keywords:'reasoning logical verbal non verbal puzzles'},
        {title:'English Grammar',keywords:'english grammar vocabulary synonyms antonyms'},
        {title:'General Knowledge / GS',keywords:'general knowledge gs gk history polity geography science'},
        {title:'Current Affairs 2026',keywords:'current affairs news daily affairs 2026'},
        {title:'Previous Year Papers / PYQ',keywords:'previous year papers pyq old papers question papers'},
        {title:'SSC Papers',keywords:'ssc papers gd cgl chsl mts je cpo'},
        {title:'RRB Papers',keywords:'rrb papers ntpc group d alp technician railway'},
        {title:'TGPSC Papers',keywords:'tgpsc papers group 1 group 2 group 3 group 4'},
        {title:'Free Ebooks',keywords:'free ebooks books pdf study material'},
        {title:'SSC GS',keywords:'ssc gs general science general studies science technology physics chemistry biology ebook pdf'},
        {title:'SSC Quantitative Aptitude',keywords:'ssc quantitative aptitude quant arithmetic algebra geometry ebook pdf'},
        {title:'SSC PureMaths',keywords:'ssc puremaths pure maths maths mathematics formula ebook pdf'},
        {title:'Free Courses',keywords:'free courses free course ssc mathematics english foundation'},
        {title:'Mock Test Folders',keywords:'mock test folders subjects practice exam tests'},
        {title:'Courses',keywords:'courses ssc tgpsc rrb classes'},
        {title:'Downloads',keywords:'downloads downloaded files materials'},
        {title:'Live Classes',keywords:'live classes online classes lessons'},
        {title:'My Progress',keywords:'my progress scores performance results'},
        {title:'Home',keywords:'home dashboard main page'}
      ].some(item => (item.title+' '+item.keywords).toLowerCase().includes(searchQuery.trim().toLowerCase()))) && (
        <Text style={{textAlign:'center',padding:20,color:darkMode?'#B8C8E0':'#687795'}}>
          No matching results found. Try another keyword.
        </Text>
      )}
    </ScrollView>
    )}
  </View>
)}

<ScrollView keyboardShouldPersistTaps="handled" style={[styles.content, {backgroundColor:pageBg}]} contentContainerStyle={{paddingBottom:24}}>
        {page === 'Home' && <>
  <View style={{marginHorizontal:16,marginTop:16,marginBottom:4,borderRadius:18,overflow:'hidden',backgroundColor:cardBg,borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F5'}}>
    <Image
      source={slideImages[activeSlide]}
      style={{width:'100%',height:190}}
      resizeMode="cover"
    />
    <View style={{flexDirection:'row',justifyContent:'center',alignItems:'center',paddingVertical:10,gap:8}}>
      {slideImages.map((_, index) => (
        <TouchableOpacity key={index} onPress={() => setActiveSlide(index)}
          style={{width:activeSlide===index?20:8,height:8,borderRadius:5,backgroundColor:activeSlide===index?'#2563EB':'#94A3B8'}} />
      ))}
    </View>
  </View>

  <Animated.View style={{
    margin:16,
    borderRadius:24,
    padding:4,
    borderWidth:3,
    borderColor:heroSpin.interpolate({
      inputRange:[0,0.5,1],
      outputRange:['#FF30FF','#00B7FF','#FF30FF']
    }),
    backgroundColor:'#07182E',
    elevation:10,
    shadowColor:heroSpin.interpolate({
      inputRange:[0,0.5,1],
      outputRange:['#FF30FF','#00B7FF','#FF30FF']
    }),
    shadowOpacity:0.9,
    shadowRadius:12
  }}><View style={[styles.hero,{margin:0,borderRadius:20}]} >
    <Text style={styles.heroSmall}>{t('YOUR GOAL, YOUR FUTURE','మీ లక్ష్యం, మీ భవిష్యత్తు')}</Text>
    <Text style={[styles.heroTitle,{color:'#FFFFFF',fontSize:17,fontStyle:'italic',fontWeight:'500',lineHeight:25,marginTop:12,textAlign:'center'}]}>{t('Thank you for choosing this app','ఈ యాప్‌ను ఎంచుకున్నందుకు ధన్యవాదాలు')}</Text>
    <Text style={[styles.heroTitle,{color:'#FFFFFF',fontSize:25,fontStyle:'italic',fontWeight:'900',marginTop:8,textAlign:'center'}]}>STUDY WITH VEER</Text>
    <Text style={styles.heroDesc}>{typedTagline}<Text style={{color:"#FBBF24"}}>{typedTagline.length < 39 ? "▍" : ""}</Text></Text>
    <TouchableOpacity onPress={() => setPage('Mock Test Folders')} activeOpacity={0.8} style={{backgroundColor:'#07182E',borderWidth:2,borderColor:'#00D9FF',borderRadius:14,paddingVertical:15,paddingHorizontal:16,alignItems:'center',justifyContent:'center',marginTop:10,elevation:5}}>
      <Text style={{color:'#FFFFFF',fontSize:17,fontWeight:'900',textAlign:'center',includeFontPadding:false}}>{t('START MOCK TEST  →','మాక్ టెస్ట్ ప్రారంభించండి  →')}</Text>
    </TouchableOpacity>
  </View>
  </Animated.View>
  <Text style={[styles.sectionTitle,{color:mainText}]}>{t('Your Study Overview','మీ చదువు వివరాలు')}</Text>
  <View style={styles.statsRow}>
    <View style={[styles.stat,{backgroundColor:cardBg,borderWidth:1,borderColor:darkMode?"#334155":"#E5EAF4"}]}><Text style={styles.statNum}>4</Text><Text style={[styles.muted,{color:mutedText}]}>{t('Subjects','విషయాలు')}</Text></View>
    <View style={[styles.stat,{backgroundColor:cardBg,borderWidth:1,borderColor:darkMode?"#334155":"#E5EAF4"}]}><Text style={styles.statNum}>{results.length}</Text><Text style={[styles.muted,{color:mutedText}]}>{t('Tests Taken','రాసిన పరీక్షలు')}</Text></View>
    <View style={[styles.stat,{backgroundColor:cardBg,borderWidth:1,borderColor:darkMode?"#334155":"#E5EAF4"}]}><Text style={styles.statNum}>{results.length ? Math.round(results.reduce((a,b)=>a+b,0)/(results.length*questions.length)*100) : 0}%</Text><Text style={[styles.muted,{color:mutedText}]}>{t('Accuracy','ఖచ్చితత్వం')}</Text></View>
  </View>
  <Text style={[styles.sectionTitle,{color:mainText}]}>{t('Explore STUDY WITH VEER','STUDY WITH VEER ను అన్వేషించండి')}</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',paddingHorizontal:16}}>
    {[
      ['My Purchases','shopping-cart','Courses','#7C3AED'],
      ['Paid Courses','shield','Paid Courses','#D97706'],
      ['Current Affairs','activity','Current Affairs 2026','#0D9488'],
      ['Previous Year Papers','file-text','Previous Year Papers','#EA580C'],
      ['Mock Tests','target','Mock Test Folders','#7C3AED'],
      ['My Progress','trending-up','My Progress','#16A34A'],
      ['Free Courses','book-open','Free Courses','#2563EB'],
      ['Free Ebooks','bookmark','Free Ebooks','#DB2777']
    ].map(([title, icon, destination]) => (
      <TouchableOpacity key={title} onPress={() => setPage(destination)}
        style={{
          width:'48%',
          minHeight:124,
          marginBottom:14,
          padding:15,
          borderRadius:20,
          backgroundColor:
            title==='Paid Courses' ? (darkMode?'#101D3A':'#FFFDF5') :
            title==='Free Courses' ? (darkMode?'#172B49':'#EFF6FF') :
            title==='Current Affairs' ? (darkMode?'#10332F':'#E8FAF5') :
            title==='Previous Year Papers' ? (darkMode?'#382416':'#FFF3E7') :
            title==='Mock Tests' ? (darkMode?'#291D45':'#F3EEFF') :
            title==='My Progress' ? (darkMode?'#12352B':'#EAF9F0') :
            title==='E-books' ? (darkMode?'#382416':'#FFF3E7') :
            (darkMode?'#1E293B':'#F1F5F9'),
          borderWidth:1,
          borderColor:
            title==='Paid Courses' ? (darkMode?'#C9A45C':'#D6B66C') :
            title==='Free Courses' ? '#60A5FA' :
            title==='Current Affairs' ? '#2DD4BF' :
            title==='Previous Year Papers' ? '#FB923C' :
            title==='Mock Tests' ? '#A78BFA' :
            title==='My Progress' ? '#4ADE80' :
            (darkMode?'#475569':'#CBD5E1'),
          borderBottomWidth:4,
          borderBottomColor:
            title==='Paid Courses' ? '#D6B66C' :
            title==='Free Courses' ? '#3B82F6' :
            title==='Current Affairs' ? '#0D9488' :
            title==='Previous Year Papers' ? '#EA580C' :
            title==='Mock Tests' ? '#7C3AED' :
            title==='My Progress' ? '#16A34A' :
            (darkMode?'#64748B':'#94A3B8'),
          justifyContent:'center',
          elevation:darkMode?0:3
        }}>
        <Feather name={icon} size={28} color={darkMode?'#BFDBFE':(title==='My Purchases'?'#7C3AED':title==='Paid Courses'?'#D97706':title==='Current Affairs'?'#0D9488':title==='Previous Year Papers'?'#EA580C':title==='Mock Tests'?'#7C3AED':title==='My Progress'?'#16A34A':title==='Free Courses'?'#2563EB':'#DB2777')} style={{marginBottom:8}} />
        <Text style={{fontSize:18,fontWeight:'800',color:darkMode?'#BFDBFE':'#173B83'}}>{t(title,({'My Purchases':'నా కొనుగోళ్లు','Paid Courses':'పెయిడ్ కోర్సులు','Current Affairs':'కరెంట్ అఫైర్స్','Previous Year Papers':'గత సంవత్సరాల ప్రశ్నపత్రాలు','Mock Tests':'మాక్ టెస్టులు','My Progress':'నా ప్రగతి','Free Courses':'ఉచిత కోర్సులు'})[title] || title)}</Text>
        <Text style={{fontSize:12,color:mutedText,marginTop:5}}>{t('Explore  ›','చూడండి  ›')}</Text>
      </TouchableOpacity>
    ))}
  </View>
</>}

{cancelTestMessage !== '' && <View style={{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:10000,elevation:30,backgroundColor:darkMode?'#0F172A':'#F3F6FC',alignItems:'center',justifyContent:'center',padding:28}}>
  <View style={{width:'100%',maxWidth:420,alignItems:'center',justifyContent:'center',padding:28,borderRadius:24,backgroundColor:darkMode?'#1E293B':'#FFFFFF',borderWidth:1,borderColor:darkMode?'#334155':'#D1FAE5'}}>
    <View style={{width:86,height:86,borderRadius:43,backgroundColor:darkMode?'#065F46':'#D1FAE5',alignItems:'center',justifyContent:'center',marginBottom:24}}>
      <Text style={{fontSize:48,color:darkMode?'#A7F3D0':'#047857',fontWeight:'900'}}>✓</Text>
    </View>
    <Text style={{fontSize:25,fontWeight:'900',color:darkMode?'#FFFFFF':'#173B83',textAlign:'center',marginBottom:14}}>Test Cancelled Successfully!</Text>
    <Text style={{fontSize:16,lineHeight:24,color:darkMode?'#CBD5E1':'#475569',textAlign:'center',marginBottom:28}}>{cancelTestMessage}</Text>
    <TouchableOpacity onPress={() => setCancelTestMessage('')} style={{width:'100%',paddingVertical:15,borderRadius:14,backgroundColor:'#173B83',alignItems:'center'}}>
      <Text style={{fontSize:16,fontWeight:'900',color:'#FFFFFF'}}>OK, Continue</Text>
    </TouchableOpacity>
  </View>
</View>}

{page === 'Mock Test Folders' && <>
  <View style={{padding:18}}>
    <Text style={styles.pageTitle}>{t('Mock Test Folders','మాక్ టెస్ట్ విభాగాలు')}</Text>
    <Text style={[styles.muted,{color:mutedText}]}>
      {t('Choose a folder to continue.','కొనసాగించడానికి ఫోల్డర్ ఎంచుకోండి.')}
    </Text>

    <TouchableOpacity
      onPress={() => setPage('SSC Subject Folders')}
      style={{marginTop:18,backgroundColor:darkMode?'#1E293B':'#FFFFFF',borderRadius:18,padding:18,borderWidth:1,borderColor:darkMode?'#334155':'#DCCBFF',flexDirection:'row',alignItems:'center'}}>
      <Image source={require("./assets/images/ssc-previous.png")} style={{width:64,height:64,resizeMode:'contain',marginRight:14}} />
      <View style={{flex:1}}>
        <Text style={{fontSize:18,fontWeight:'900',color:darkMode?'#FFFFFF':'#173B83'}}>SSC Mock Tests</Text>
        <Text style={[styles.muted,{color:mutedText,marginTop:5}]}>Mathematics • Reasoning • English • General Knowledge</Text>
        <Text style={{color:'#7952C7',fontWeight:'800',marginTop:10}}>{t('Open Folder →','ఫోల్డర్ తెరవండి →')}</Text>
      </View>
    </TouchableOpacity>

    <TouchableOpacity onPress={() => setPage('Home')} style={{paddingVertical:16,paddingHorizontal:18,marginTop:18,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center',minHeight:58}}>
      <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:17}}>🏠  ← Back to Home</Text>
    </TouchableOpacity>
  </View>
</>}

{page === 'SSC Subject Folders' && <>
  <View style={{padding:18}}>
    <Text style={styles.pageTitle}>{t('SSC Mock Tests','ఎస్‌ఎస్‌సి మాక్ టెస్టులు')}</Text>
    <Text style={[styles.muted,{color:mutedText}]}>{t('Choose a subject to start your practice test.','ప్రాక్టీస్ టెస్ట్ కోసం ఒక సబ్జెక్ట్ ఎంచుకోండి.')}</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'stretch'}}>
      {[
        ['Mathematics','01','Arithmetic, Percentage, Algebra'],
        ['Reasoning','02','Series, Analogy, Coding-Decoding'],
        ['English','03','Grammar, Vocabulary, Spelling'],
        ['General Knowledge','04','History, Geography, Polity, Science']
      ].map(([subject, icon, description]) => (
        <TouchableOpacity
          key={subject}
          onPress={() => {
            if (subject === 'Mathematics') {
              setCurrentSubject('Mathematics');
              setPage('Mathematics Mock Topic Folders');
            } else {
              setCurrentSubject(subject);
              setPage('Subject Topic Folders');
            }
          }}
          style={{width:'48%',minHeight:250,alignSelf:'stretch',marginTop:14,backgroundColor:darkMode?'#1E293B':'#FFFFFF',borderRadius:18,padding:14,borderWidth:1,borderColor:darkMode?'#334155':'#DCCBFF',justifyContent:'space-between'}}>
          <View style={{width:44,height:44,borderRadius:12,backgroundColor:darkMode?'#352653':'#F0E8FF',alignItems:'center',justifyContent:'center',marginBottom:12,overflow:'hidden'}}>
            <Image source={require("./assets/images/ssc-previous.png")} style={{width:'100%',height:'100%',resizeMode:'contain'}} />
          </View>
          <Text style={[styles.subjectTitle,{color:darkMode?'#FFFFFF':'#173B83'}]}>{t(subject === 'Mathematics' ? 'SSC Mathematics' : subject === 'Reasoning' ? 'SSC Reasoning' : subject === 'English' ? 'SSC English' : 'SSC General Knowledge',subject==='Mathematics'?'గణిత మాక్ టెస్టులు':subject==='Reasoning'?'SSC రీజనింగ్':subject==='English'?'SSC ఇంగ్లీష్':'SSC జనరల్ నాలెడ్జ్')}</Text>
          <Text style={[styles.muted,{color:mutedText}]}>{description}</Text>
          <View style={{marginTop:12,backgroundColor:darkMode?'#352653':'#E9DEFF',padding:11,borderRadius:10}}>
            <Text style={{color:darkMode?'#FFFFFF':'#5B36A5',fontWeight:'800',textAlign:'center'}}>{t('Open →','పరీక్ష ప్రారంభించండి →')}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
    <TouchableOpacity onPress={() => setPage('Mock Test Folders')} style={{paddingVertical:16,paddingHorizontal:18,marginTop:18,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center',minHeight:58}}>
      <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:17}}>← Back to Folders</Text>
    </TouchableOpacity>
  </View>
</>}

        {page === 'Mathematics Mock Topic Folders' && <>
          <View style={{padding:18}}>
            <Text style={styles.pageTitle}>Mathematics Topic Folders</Text>
            <Text style={[styles.muted,{color:mutedText,marginTop:5}]}>
              Choose a topic, then tap Open to start your mock test.
            </Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
              {quantTopics.map((topic,index) => (
                <View key={topic} style={{width:'48%',marginTop:14,padding:14,borderRadius:16,backgroundColor:darkMode?'#1E293B':'#FFFFFF',borderWidth:1,borderColor:darkMode?'#334155':'#DCCBFF'}}>
                  <Text style={{fontSize:18,fontWeight:'900',color:mainText,marginBottom:10}}>📁 {String(index+1).padStart(2,'0')}</Text>
                  <Text style={{fontSize:14,fontWeight:'900',color:mainText,minHeight:38}}>{topic}</Text>
                  <Text style={{fontSize:11,color:mutedText,marginTop:5}}>
                    Topic-wise practice
                  </Text>
                  <TouchableOpacity onPress={() => startTest('Mathematics',topic)} style={{marginTop:12,backgroundColor:'#2457D6',paddingVertical:11,borderRadius:10,alignItems:'center'}}>
                    <Text style={{color:'#FFFFFF',fontWeight:'900'}}>Start Test →</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={() => setPage('SSC Subject Folders')} style={{paddingVertical:16,marginTop:20,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to SSC Mock Tests</Text>
            </TouchableOpacity>
          </View>
        </>}

        {page === 'Subject Topic Folders' && <>
          <View style={{padding:18}}>
            <Text style={styles.pageTitle}>{currentSubject} Topic Folders</Text>
            <Text style={[styles.muted,{color:mutedText,marginTop:5}]}>Choose a topic, then tap Open to start your mock test.</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
              {(currentSubject === 'Reasoning'
                ? ['Analogy','Series','Coding-Decoding','Classification','Blood Relations','Direction Sense','Ranking & Order','Syllogism']
                : currentSubject === 'English'
                  ? ['Synonyms & Antonyms','Spelling','Grammar','Tenses','Subject-Verb Agreement','Articles','Prepositions','Vocabulary']
                  : ['Indian History','Indian Geography','Indian Polity','General Science','Indian Economy','Static GK','Important Days','Books & Authors']
              ).map((topic,index) => (
                <View key={topic} style={{width:'48%',marginTop:14,padding:14,borderRadius:16,backgroundColor:darkMode?'#1E293B':'#FFFFFF',borderWidth:1,borderColor:darkMode?'#334155':'#DCCBFF'}}>
                  <Text style={{fontSize:18,fontWeight:'900',color:mainText,marginBottom:10}}>📁 {String(index+1).padStart(2,'0')}</Text>
                  <Text style={{fontSize:14,fontWeight:'900',color:mainText,minHeight:38}}>{topic}</Text>
                  <Text style={{fontSize:11,color:mutedText,marginTop:5}}>Topic-wise practice</Text>
                  <TouchableOpacity onPress={() => {
                    const topicKey = currentSubject + ': ' + topic;
                    if (['Reasoning', 'English', 'General Knowledge'].includes(currentSubject)) {
                      setQuantTopic(topicKey);
                      setQuantQuestion(0);
                      setQuantAnswers({});
                      setQuantFinished(false);
                      setPage('Quant Questions');
                    } else {
                      startTest(currentSubject, topicKey);
                    }
                  }} style={{marginTop:12,backgroundColor:'#2457D6',paddingVertical:11,borderRadius:10,alignItems:'center'}}>
                    <Text style={{color:'#FFFFFF',fontWeight:'900'}}>Open →</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={() => setPage('SSC Subject Folders')} style={{paddingVertical:16,marginTop:20,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to SSC Mock Tests</Text>
            </TouchableOpacity>
          </View>
        </>}

          {page === "Current Affairs 2026" && <>
  <View style={{padding:18}}>
    <Text style={styles.pageTitle}>2026 Current Affairs</Text>
    <Text style={{color:mutedText,marginTop:8}}>Free Current Affairs PDF</Text>

    <View style={{flexDirection:'row',gap:10,marginTop:16}}>
      <TouchableOpacity
        onPress={() => Linking.openURL('https://drive.google.com/file/d/1cUXADG1-JrIlXgjPFIZvsPMwk3E9gMWk/view')}
        style={{flex:1,backgroundColor:BLUE,paddingVertical:16,paddingHorizontal:6,borderRadius:14,alignItems:'center',justifyContent:'center',minHeight:64}}>
        <Text style={{color:'#FFFFFF',fontSize:14,fontWeight:'800',textAlign:'center'}}>📖 View PDF</Text>
      </TouchableOpacity>

      <TouchableOpacity
        disabled={pdfDownloadBusy}
        onPress={() => downloadStudyPdfForOffline(
          'https://drive.google.com/uc?export=download&id=1cUXADG1-JrIlXgjPFIZvsPMwk3E9gMWk',
          'Current-Affairs-2026.pdf'
        )}
        style={{flex:1,backgroundColor:'#0D9668',paddingVertical:16,paddingHorizontal:6,borderRadius:14,alignItems:'center',justifyContent:'center',minHeight:64,opacity:pdfDownloadBusy?0.6:1}}>
        <Text style={{color:'#FFFFFF',fontSize:14,fontWeight:'800',textAlign:'center'}}>
          {pdfDownloadBusy ? '⏳ Downloading…' : '📥 Download Offline'}
        </Text>
      </TouchableOpacity>
    </View>

    <Text style={{color:mutedText,fontSize:12,marginTop:10}}>
      Free PDF. Download it once to save it for offline study.
    </Text>
  </View>

  <TouchableOpacity onPress={() => setPage('Home')} style={{paddingVertical:16,paddingHorizontal:18,marginTop:4,marginBottom:8,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center',minHeight:58}}>
    <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:17}}>{'🏠  ← Back to Home'}</Text>
  </TouchableOpacity>
</>}

{page === 'Free Ebooks' && <>
  <View style={{paddingHorizontal:16,paddingTop:18,paddingBottom:10}}>
    <View style={{backgroundColor:darkMode?'#102C59':'#073B8C',borderRadius:22,padding:20,marginBottom:22,overflow:'hidden',borderWidth:1,borderColor:darkMode?'#315B91':'#1556B0'}}>
      <Text style={{fontSize:13,fontWeight:'800',letterSpacing:2,color:'#70F0D0'}}>STUDY WITH VEER</Text>
      <Text style={{fontSize:30,fontWeight:'900',color:'#FFFFFF',marginTop:8}}>Free <Text style={{color:'#54E6C0'}}>Ebook</Text></Text>
      <Text style={{fontSize:14,color:'#E0ECFF',marginTop:8,lineHeight:21}}>Your study library</Text>
      <Text style={{fontSize:14,color:'#E0ECFF',lineHeight:21}}>Explore free SSC notes, books and PDFs.</Text>
      <View style={{flexDirection:'row',alignItems:'center',marginTop:16}}>
        <Text style={{fontSize:13,fontWeight:'800',color:'#FFFFFF',backgroundColor:'#1764B9',paddingVertical:8,paddingHorizontal:12,borderRadius:20}}>📚  5 SUBJECT FOLDERS</Text>
      </View>
    </View>

    {[
      {title:'SSC PureMaths',desc:'Formulae • Concepts • Practice',icon:'📐',color:'#0878E8',pale:darkMode?'#172B49':'#EDF6FF'},
      {title:'SSC Quantitative Aptitude',desc:'Arithmetic • Algebra • Geometry',icon:'🧮',color:'#009F83',pale:darkMode?'#123A37':'#E9FBF6'},
      {title:'SSC Reasoning',desc:'Verbal • Non-Verbal • Logical',icon:'🧠',color:'#6344E8',pale:darkMode?'#282247':'#F2EEFF'},
      {title:'SSC General Science And Technology',desc:'Physics • Chemistry • Biology',icon:'🔬',color:'#E83F61',pale:darkMode?'#3B202D':'#FFF0F3'},
      {title:'SSC English',desc:'Grammar • Vocabulary • Book PDFs',icon:'📘',color:'#D97706',pale:darkMode?'#3B2D1B':'#FFF7E8'}
    ].map(folder => (
      <TouchableOpacity key={folder.title}
        onPress={() => folder.title === 'SSC PureMaths' ? setPage('Free Ebooks PureMaths') : folder.title === 'SSC Quantitative Aptitude' ? setPage('Free Ebooks Quantitative') : folder.title === 'SSC English' ? setPage('Free Ebooks SSC English') : folder.title === 'SSC General Science And Technology' ? setPage('Free Ebooks SSC Science') : folder.title === 'SSC Reasoning' ? setPage('Free Ebooks Reasoning') : Linking.openURL(String.fromCharCode(104,116,116,112,115,58,47,47,100,114,105,118,101,46,103,111,111,103,108,101,46,99,111,109,47,102,105,108,101,47,100,47,49,56,85,51,105,65,55,107,71,72,95,65,75,78,109,76,51,109,83,97,51,114,80,51,86,78,98,53,114,105,121,85,76,47,118,105,101,119,63,117,115,112,61,100,114,105,118,101,115,100,107))}
        style={{flexDirection:'row',alignItems:'center',backgroundColor:folder.pale,borderRadius:21,padding:13,marginBottom:14,borderWidth:1,borderColor:folder.color+'55',borderLeftWidth:5,borderLeftColor:folder.color,elevation:4,shadowColor:folder.color,shadowOffset:{width:0,height:3},shadowOpacity:darkMode?0.15:0.08,shadowRadius:7,minHeight:108}}>
        <View style={{width:100,height:100,borderRadius:17,backgroundColor:folder.color+'20',alignItems:'center',justifyContent:'center',marginRight:13,overflow:'hidden'}}>
          <Image source={require('./assets/images/ssc-previous.png')} style={{width:'100%',height:'100%',resizeMode:'contain'}} />
        </View>
        <View style={{flex:1}}>
          <Text style={{fontSize:16,fontWeight:'900',color:darkMode?'#FFFFFF':'#12366F',lineHeight:22}}>{folder.title}</Text>
          <Text style={{fontSize:12,color:darkMode?'#D1DDEC':'#526987',marginTop:5,lineHeight:17}}>{folder.desc}</Text>
          <View style={{alignSelf:'flex-start',backgroundColor:folder.color+'18',paddingVertical:5,paddingHorizontal:9,borderRadius:14,marginTop:8}}>
            <Text style={{fontSize:11,fontWeight:'800',color:folder.color}}>📘 Free Study Materials</Text>
          </View>
        </View>
        <View style={{width:38,height:38,borderRadius:19,backgroundColor:folder.color,alignItems:'center',justifyContent:'center',marginLeft:7}}>
          <Text style={{fontSize:27,fontWeight:'900',color:'#FFFFFF'}}>›</Text>
        </View>
      </TouchableOpacity>
    ))}



    <Text style={{textAlign:'center',fontSize:13,color:mutedText,marginBottom:12}}>📚 Learn  •  Practice  •  Succeed</Text>
  </View>

  <TouchableOpacity onPress={() => setPage('Home')} style={{marginHorizontal:16,paddingVertical:15,paddingHorizontal:18,marginTop:4,marginBottom:16,borderRadius:16,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center',minHeight:54}}>
    <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>🏠  ← Back to Home</Text>
  </TouchableOpacity>
</>}


{page === 'Free Ebooks SSC Science' && <>
  <View style={{padding:18}}>
    <Text style={styles.pageTitle}>SSC General Science PDFs</Text>
    <Text style={{color:mutedText,marginTop:8}}>Physics • Chemistry • Biology • Technology</Text>
    {[
      {title:'Science PDF 1',id:'1gtaz_UtMtka6NBi68FvIop39Eqbc2b33'},
      {title:'Science PDF 2',id:'1GElClItIW9FI43kf2H7MRUBovDzMxWNs'},
      {title:'Science PDF 3',id:'1h3tLowJN7F-oQTWXqjcWIjxCVRTyo39t'},
      {title:'Science PDF 4',id:'1Y55bK3FjvO6MC8qbqZLon7jndBZrxGso'},
      {title:'Science PDF 5',id:'1VXg2EfRYcFtIxmSrDKPK_jU9jwRoiMke'},
      {title:'Science PDF 6',id:'1XBnvM99O_BLNLiMGNcYZDZoqdIW9VtnD'}
    ].map(pdf => (
      <TouchableOpacity key={pdf.id}
        onPress={() => Linking.openURL('https://drive.google.com/file/d/' + pdf.id + '/view')}
        style={{backgroundColor:darkMode?'#172B49':'#FFF0F3',padding:16,borderRadius:14,marginTop:12,borderWidth:1,borderColor:'#E83F61'}}>
        <Text style={{color:mainText,fontSize:15,fontWeight:'800'}}>🔬 {pdf.title}</Text>
        <Text style={{color:mutedText,fontSize:12,marginTop:5}}>Tap to open PDF ↗</Text>
      </TouchableOpacity>
    ))}
    <TouchableOpacity onPress={() => setPage('Free Ebooks')}
      style={{backgroundColor:'#2457D6',padding:16,borderRadius:14,marginTop:20,alignItems:'center'}}>
      <Text style={{color:'#FFFFFF',fontWeight:'900'}}>← Back to Free Ebooks</Text>
    </TouchableOpacity>
  </View>
</>}




{page === 'Free Ebooks PureMaths' && <>
  <View style={{padding:18}}>
    <Text style={styles.pageTitle}>SSC PureMaths</Text>
    <Text style={{color:mutedText,marginTop:8}}>Formulae • Concepts • Practice</Text>

    <TouchableOpacity
      onPress={() => Linking.openURL('https://drive.google.com/file/d/18U3iA7kGH_AKNmL3mSa3rP3VNb5riyUL/view')}
      style={{backgroundColor:darkMode?'#172B49':'#EDF6FF',padding:16,borderRadius:14,marginTop:16,borderWidth:1,borderColor:'#0878E8'}}>
      <Text style={{color:mainText,fontSize:16,fontWeight:'800'}}>📐 PureMaths PDF 1</Text>
      <Text style={{color:mutedText,fontSize:12,marginTop:5}}>Tap to open PDF ↗</Text>
    </TouchableOpacity>

    <TouchableOpacity onPress={() => setPage('Free Ebooks')} style={{backgroundColor:'#2457D6',padding:16,borderRadius:14,marginTop:18,alignItems:'center'}}>
      <Text style={{color:'#FFFFFF',fontWeight:'900'}}>← Back to Free Ebooks</Text>
    </TouchableOpacity>
  </View>
</>}

{page === 'Free Ebooks Quantitative' && <>
  <View style={{padding:18}}>
    <Text style={styles.pageTitle}>SSC Quantitative Aptitude</Text>
    <Text style={{color:mutedText,marginTop:8}}>Arithmetic • Algebra • Geometry</Text>
    <TouchableOpacity
      onPress={() => Linking.openURL('https://drive.google.com/file/d/1uk2wX_9I4WMwas6OBS9zN3ZZqGHZXWnH/view')}
      style={{backgroundColor:darkMode?'#123A37':'#E9FBF6',padding:16,borderRadius:14,marginTop:16,borderWidth:1,borderColor:'#009F83'}}>
      <Text style={{color:mainText,fontSize:16,fontWeight:'800'}}>🧮 Quantitative Aptitude PDF 1</Text>
      <Text style={{color:mutedText,fontSize:12,marginTop:5}}>Tap to open PDF ↗</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={() => setPage('Free Ebooks')} style={{backgroundColor:'#2457D6',padding:16,borderRadius:14,marginTop:18,alignItems:'center'}}>
      <Text style={{color:'#FFFFFF',fontWeight:'900'}}>← Back to Free Ebooks</Text>
    </TouchableOpacity>
  </View>
</>}

{page === 'Free Ebooks Reasoning' && <>
  <View style={{padding:18}}>
    <Text style={styles.pageTitle}>SSC Reasoning</Text>
    <Text style={{color:mutedText,marginTop:8}}>Verbal • Non-Verbal • Logical Reasoning</Text>
    <TouchableOpacity
      onPress={() => Linking.openURL('https://drive.google.com/file/d/1WJ_F1oxMoE-VgvKWNJ8E0Y8bOHxblKSf/view')}
      style={{backgroundColor:darkMode?'#282247':'#F2EEFF',padding:16,borderRadius:14,marginTop:16,borderWidth:1,borderColor:'#6344E8'}}>
      <Text style={{color:mainText,fontSize:16,fontWeight:'800'}}>🧠 Reasoning PDF 1</Text>
      <Text style={{color:mutedText,fontSize:12,marginTop:5}}>Tap to open PDF ↗</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={() => setPage('Free Ebooks')} style={{backgroundColor:'#2457D6',padding:16,borderRadius:14,marginTop:18,alignItems:'center'}}>
      <Text style={{color:'#FFFFFF',fontWeight:'900'}}>← Back to Free Ebooks</Text>
    </TouchableOpacity>
  </View>
</>}

{page === 'Free Ebooks SSC English' && <>
  <View style={{padding:18}}>
    <Text style={styles.pageTitle}>SSC English Books</Text>
    <Text style={{color:mutedText,marginTop:8}}>Free English grammar and vocabulary PDFs</Text>
    <View style={{backgroundColor:cardBg,padding:16,borderRadius:14,marginTop:16,borderWidth:1,borderColor:mutedText}}>
      <Text style={{color:mainText,fontSize:16,fontWeight:'800'}}>📘 English Book PDF</Text>

      <TouchableOpacity
        key="English PDF 1"
        onPress={() => Linking.openURL('https://drive.google.com/file/d/1JiGjn8e6cvSGKM_C2Rtl6cTG39e7UqWs/view')}
        style={{backgroundColor:darkMode?'#172B49':'#FFF7E8',padding:16,borderRadius:14,marginTop:12,borderWidth:1,borderColor:'#D97706'}}
      >
        <Text style={{color:mainText,fontSize:15,fontWeight:'800'}}>📘 English PDF 1</Text>
        <Text style={{color:mutedText,fontSize:12,marginTop:5}}>Tap to open PDF ↗</Text>
      </TouchableOpacity>

      <TouchableOpacity
        key="English PDF 2"
        onPress={() => Linking.openURL('https://drive.google.com/file/d/1tjoMS_N6VlbCdGlWWKTBesWCuEP2DWJ1/view')}
        style={{backgroundColor:darkMode?'#172B49':'#FFF7E8',padding:16,borderRadius:14,marginTop:12,borderWidth:1,borderColor:'#D97706'}}
      >
        <Text style={{color:mainText,fontSize:15,fontWeight:'800'}}>📘 English PDF 2</Text>
        <Text style={{color:mutedText,fontSize:12,marginTop:5}}>Tap to open PDF ↗</Text>
      </TouchableOpacity>

      <TouchableOpacity
        key="English PDF 3"
        onPress={() => Linking.openURL('https://drive.google.com/file/d/1j7LYzHGfLyIk-V-Xxx_B0xX7edRRGLqK/view')}
        style={{backgroundColor:darkMode?'#172B49':'#FFF7E8',padding:16,borderRadius:14,marginTop:12,borderWidth:1,borderColor:'#D97706'}}
      >
        <Text style={{color:mainText,fontSize:15,fontWeight:'800'}}>📘 English PDF 3</Text>
        <Text style={{color:mutedText,fontSize:12,marginTop:5}}>Tap to open PDF ↗</Text>
      </TouchableOpacity>

      <TouchableOpacity
        key="English PDF 4"
        onPress={() => Linking.openURL('https://drive.google.com/file/d/1N4arjPHtHiQkK-K5oK_c8IhnTPtlgY8c/view')}
        style={{backgroundColor:darkMode?'#172B49':'#FFF7E8',padding:16,borderRadius:14,marginTop:12,borderWidth:1,borderColor:'#D97706'}}
      >
        <Text style={{color:mainText,fontSize:15,fontWeight:'800'}}>📘 English PDF 4</Text>
        <Text style={{color:mutedText,fontSize:12,marginTop:5}}>Tap to open PDF ↗</Text>
      </TouchableOpacity>
    </View>
    <TouchableOpacity onPress={() => setPage('Free Ebooks')} style={{backgroundColor:'#2457D6',padding:16,borderRadius:14,marginTop:18,alignItems:'center'}}>
      <Text style={{color:'#FFFFFF',fontWeight:'900'}}>← Back to Free Ebooks</Text>
    </TouchableOpacity>
  </View>
</>}

{page === 'Previous Year Papers' && <>
            <View style={{padding:18}}>
              <Text style={styles.pageTitle}>Previous Year Papers</Text>

              <Text style={[styles.muted,{color:mutedText}]}>Choose your exam board.</Text>

              <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginTop:14}}>
                {[
                  {title:'SSC Previous Papers',page:'SSC Papers',image:require('./assets/images/ssc-previous.png'),subtitle:'GD • CGL • CHSL • MTS'},
                  {title:'RRB Previous Papers',page:'RRB Papers',image:require('./assets/images/rrb-previous.jpeg'),subtitle:'NTPC • Group D • ALP'},
                  {title:'TGPSC Previous Papers',page:'TGPSC Papers',image:require('./assets/images/tgpsc-previous.png'),subtitle:'Groups 1 • 2 • 3 • 4'}
                ].map(board => (
                  <TouchableOpacity key={board.page} onPress={() => setPage(board.page)} style={{width:'48.5%',backgroundColor:cardBg,borderRadius:16,marginBottom:14,padding:10,borderWidth:1,borderColor:mutedText,alignItems:'center',overflow:'hidden'}}>
                    <Image source={board.image} style={{width:'100%',height:125,borderRadius:11}} resizeMode="cover" />
                    <Text style={{color:mainText,fontSize:14,fontWeight:'900',textAlign:'center',marginTop:10}}>{board.title}</Text>
                    <Text style={{color:mutedText,fontSize:11,textAlign:'center',marginTop:5}}>{board.subtitle}</Text>
                    <View style={{backgroundColor:BLUE,borderRadius:9,paddingVertical:9,paddingHorizontal:12,marginTop:10,width:'100%',alignItems:'center'}}>
                      <Text style={{color:'#FFFFFF',fontSize:12,fontWeight:'900'}}>Open Papers  ›</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

      <TouchableOpacity onPress={() => setPage('Home')} style={{paddingVertical:16,paddingHorizontal:18,marginTop:4,marginBottom:8,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center',minHeight:58}}>
        <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:17}}>{'🏠  ← Back to Home'}</Text>
      </TouchableOpacity></>}
          {['SSC Papers','RRB Papers','TGPSC Papers'].includes(page) && <>
            <View style={{padding:18}}>
  <Text style={styles.pageTitle}>{page}</Text>
  <Text style={[styles.muted,{color:'#000000'}]}>Choose your exam.</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginTop:12}}>
    {(page === 'SSC Papers' ? ['SSC GD','SSC CGL','SSC CHSL','SSC MTS','SSC JE','SSC CPO'] : page === 'RRB Papers' ? ['RRB NTPC','RRB Group D','RRB ALP','RRB Technician'] : ['TGPSC Group 1','TGPSC Group 2','TGPSC Group 3','TGPSC Group 4']).map(exam => (
      <TouchableOpacity key={exam} onPress={() => {
        if (page === 'SSC Papers') {
          setPage(exam + ' - Subject Folders');
        } else {
          setPage(exam + ' - Papers Link Not Added');
        }
      }} style={{width:'48.5%',backgroundColor:cardBg,padding:10,borderRadius:15,marginTop:12,borderWidth:1,borderColor:mutedText,alignItems:'center'}}>
        {page === 'SSC Papers' ? (
          <Image source={({
            'SSC GD':require('./assets/images/ssc-gd.jpeg'),
            'SSC CGL':require('./assets/images/ssc-cgl.png'),
            'SSC CHSL':require('./assets/images/ssc-chsl.png'),
            'SSC MTS':require('./assets/images/ssc-mts.png'),
            'SSC JE':require('./assets/images/ssc-je.jpeg'),
            'SSC CPO':require('./assets/images/ssc-cpo.jpeg')
          })[exam]} style={{width:'100%',height:110,borderRadius:10}} resizeMode="contain" />
        ) : (
          <View style={{width:42,height:42,borderRadius:13,backgroundColor:darkMode?'#233B65':'#E6EDFF',alignItems:'center',justifyContent:'center',marginBottom:9}}>
            <Text style={{fontSize:22}}>{page === 'RRB Papers' ? '🚆' : '📚'}</Text>
          </View>
        )}
        <Text style={{color:mainText,fontSize:14,fontWeight:'900',textAlign:'center',marginTop:8}}>{exam}</Text>
        <Text style={{color:mutedText,fontSize:11,marginTop:5,textAlign:'center'}}>{page === 'SSC Papers' ? 'Previous Papers' : 'Papers link not added yet'}</Text>
        <View style={{backgroundColor:BLUE,borderRadius:9,paddingVertical:10,marginTop:10,width:'100%',alignItems:'center'}}>
  <Text style={{color:'#FFFFFF',fontSize:12,fontWeight:'900'}}>Open  ›</Text>
</View>
      </TouchableOpacity>
    ))}
  </View>
</View>
<TouchableOpacity onPress={() => setPage('Previous Year Papers')} style={{width:'100%',alignSelf:'stretch',paddingVertical:16,paddingHorizontal:18,marginTop:24,marginBottom:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center',minHeight:58}}>
                <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to Previous Year Papers</Text>
              </TouchableOpacity>

          </>}
          {page.endsWith(' - Subject Folders') && <>
            <View style={{padding:18}}>
              <Text style={styles.pageTitle}>{page.replace(' - Subject Folders','')}</Text>
              <Text style={[styles.muted,{color:mutedText}]}>Choose a subject for previous year papers.</Text>
              {['SSC English Previous Papers','SSC Maths Previous Papers','SSC Reasoning Previous Papers','SSC General Awareness Previous Papers'].map(subject => (
                <TouchableOpacity key={subject} onPress={() => setPage(page.replace(' - Subject Folders','') + ' - ' + subject)} style={{backgroundColor:cardBg,padding:16,borderRadius:12,marginTop:12,borderWidth:1,borderColor:mutedText}}>
                  <Text style={{color:mainText,fontSize:15,fontWeight:'800'}}>📁  {subject}  ›</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setPage('SSC Papers')} style={{padding:16,margin:12,borderRadius:12,backgroundColor:'#2457D6',alignItems:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900'}}>← Back to SSC Exams</Text>
            </TouchableOpacity>
          </>}

          {page.endsWith(' Previous Papers') && page.includes(' - SSC ') && (() => {
            const subjectLinks = [
              { name: 'SSC English Previous Papers', id: '1CvD0vN9Lz0ixr81Dc9XDzQz9IYgqdJl8' },
              { name: 'SSC Maths Previous Papers', id: '1AJyu9c0aWFfayowXjR--tK5cLqfUoxKr' },
              { name: 'SSC Reasoning Previous Papers', id: '1AvLJ3yK-4SNt3Fdwu_l2FGZZ29Ond87o' },
              { name: 'SSC General Awareness Previous Papers', id: '1NbqWACIKge6CEDHDBHR6DG3jhGZy0adp' }
            ];
            const subject = subjectLinks.find(item => page.includes(item.name));
            const viewUrl = subject ? 'https://drive.google.com/file/d/' + subject.id + '/view' : '';
            const downloadUrl = subject ? 'https://drive.google.com/uc?export=download&id=' + subject.id : '';
            const fileName = subject ? subject.name.replace(/ /g, '-') + '.pdf' : 'SSC-Previous-Papers.pdf';

            return <>
              <View style={{padding:18}}>
                <Text style={styles.pageTitle}>{subject ? subject.name : 'SSC Previous Papers'}</Text>
                <Text style={[styles.muted,{color:mutedText,marginTop:8}]}>View the PDF online or download it for offline study.</Text>

                <View style={{flexDirection:'row',gap:10,marginTop:16}}>
                  <TouchableOpacity
                    onPress={() => viewUrl && Linking.openURL(viewUrl).catch(() => Alert.alert('Unable to open PDF','Please try again.'))}
                    style={{flex:1,backgroundColor:BLUE,paddingVertical:16,paddingHorizontal:6,borderRadius:14,alignItems:'center',justifyContent:'center',minHeight:64}}>
                    <Text style={{color:'#FFFFFF',fontSize:14,fontWeight:'800',textAlign:'center'}}>📖 View PDF</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={pdfDownloadBusy || !subject}
                    onPress={() => downloadStudyPdfForOffline(downloadUrl, fileName)}
                    style={{flex:1,backgroundColor:'#0D9668',paddingVertical:16,paddingHorizontal:6,borderRadius:14,alignItems:'center',justifyContent:'center',minHeight:64,opacity:pdfDownloadBusy?0.6:1}}>
                    <Text style={{color:'#FFFFFF',fontSize:14,fontWeight:'800',textAlign:'center'}}>
                      {pdfDownloadBusy ? '⏳ Downloading…' : '📥 Download Offline'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={{color:mutedText,fontSize:12,marginTop:10}}>
                  Download once for offline study. Google Drive permissions must allow access to the PDF.
                </Text>
              </View>

              <TouchableOpacity onPress={() => setPage(page.split(' - ')[0] + ' - Subject Folders')} style={{padding:16,margin:12,borderRadius:12,backgroundColor:'#2457D6',alignItems:'center'}}>
                <Text style={{color:'#FFFFFF',fontWeight:'900'}}>← Back to Subject Folders</Text>
              </TouchableOpacity>
            </>;
          })()}

          {page.endsWith(' - Papers Link Not Added') && <>
            <View style={{padding:18}}>

              <Text style={styles.pageTitle}>Papers Link Not Added</Text>
              <Text style={[styles.muted,{color:mutedText,marginTop:10}]}>Question papers for this exam have not been added yet.</Text>
            </View>
              <TouchableOpacity onPress={() => setPage(page.startsWith('RRB') ? 'RRB Papers' : 'TGPSC Papers')} style={{width:'100%',alignSelf:'stretch',paddingVertical:16,paddingHorizontal:18,marginTop:24,marginBottom:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center',minHeight:58}}>
                <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to exam folders</Text>
              </TouchableOpacity>

          </>}

        {page === 'Subjects' && <>
          <Text style={styles.pageTitle}>{t('All Subjects','అన్ని విషయాలు')}</Text>
          <Text style={[styles.muted,{color:mutedText}]}>{t('Build strong fundamentals, one topic at a time.','ఒక్కో అంశాన్ని నేర్చుకుంటూ పునాదులను బలపరచుకోండి.')}</Text>
          {subjects.map(s => <View key={s[0]} style={styles.subjectCard}>
            <Text style={styles.subjectEmoji}>{s[2]}</Text>
            <Text style={styles.subjectTitle}>{s[0]}</Text>
            <Text style={[styles.muted,{color:mutedText}]}>{s[1]}</Text>
            {button(t('Practise with Mock Test','మాక్ టెస్ట్‌తో సాధన చేయండి'), () => startTest(s[0]), true)}
          </View>)}
        </>}

        {(page === 'Courses' || page === 'Paid Courses' || page === 'SSC Courses' || page === 'TGPSC Courses' || page === 'RRB Courses' || page.startsWith('SSC Exam:') || page.startsWith('RRB Exam:')) && <>


            <View style={{alignSelf:'center',width:'95%',marginTop:12,marginBottom:4,backgroundColor:darkMode?'#253D70':'#2457D6',borderRadius:16,paddingVertical:13,paddingHorizontal:12,alignItems:'center',justifyContent:'center',elevation:3}}>
              <Text style={{fontSize:22,fontWeight:'900',color:'#FFFFFF',textAlign:'center'}}>
                {(page === 'Courses' || page === 'Paid Courses') ? t('Choose Your Exam','మీ పరీక్షను ఎంచుకోండి') : page.startsWith('SSC Exam:') ? page.replace('SSC Exam: ','') : page === 'SSC Courses' ? t('SSC Exams','SSC పరీక్షలు') : page === 'TGPSC Courses' ? t('TGPSC Exams','TGPSC పరీక్షలు') : t('RRB Exams','RRB పరీక్షలు')}
              </Text>
            </View>
            <Text style={{fontSize:13,fontWeight:'700',color:darkMode?'#CBD5E1':'#52627A',marginTop:8,marginBottom:4,textAlign:'center',alignSelf:'center',width:'95%'}}>
              {t('STUDY WITH VEER • Prepare Smart. Achieve More.','STUDY WITH VEER • తెలివిగా సిద్ధం అవ్వండి. మరింత సాధించండి.')}
            </Text>


            {page === 'Courses' && (() => {
              const packOwned = !!unlockedCourses['ssc-all-subjects-pack'];
              const subjects = [
                {id:'ssc-mathematics',title:'SSC Mathematics',desc:'Arithmetic and topic-wise practice',image:require('./assets/images/ssc-mathematics.jpeg'),target:'Quant Practice',color:'#7C3AED'},
                {id:'ssc-reasoning-masterclass',title:'SSC Reasoning',desc:'Verbal and non-verbal reasoning',image:require('./assets/images/ssc-reasoning.jpeg'),target:'Master Reasoning Syllabus',color:'#2563EB'},
                {id:'ssc-general-awareness',title:'SSC General Awareness',desc:'History, geography, polity and science',image:require('./assets/images/ssc-general-awareness.jpeg'),target:'SSC General Awareness Syllabus',color:'#059669'},
                {id:'ssc-english-foundation',title:'SSC English',desc:'Grammar and vocabulary',image:require('./assets/images/ssc-english.jpeg'),target:'SSC English Folders',color:'#D97706'}
              ].filter(course => packOwned || !!unlockedCourses[course.id]);

              return subjects.length ? (
                <View style={{paddingHorizontal:10,width:'100%',alignSelf:'stretch',flexDirection:'column'}}>
                  {subjects.map(course => (
                    <TouchableOpacity key={course.id} onPress={() => setPage(course.target)}
                      style={{width:'100%',alignSelf:'stretch',backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:16,padding:16,marginTop:14,borderWidth:1,borderColor:darkMode?'#2B3D5C':'#E0E7F2',elevation:3}}>
                      <View style={{width:'100%',height:230,borderRadius:12,backgroundColor:darkMode?course.color+'33':'#F0F4FF',marginBottom:14,overflow:'hidden',alignSelf:'stretch'}}>
                        <Image source={course.image} style={{width:'100%',height:'100%'}} resizeMode="contain" />
                      </View>
                      <Text style={{fontSize:22,fontWeight:'900',lineHeight:29,minHeight:32,color:'#000000'}}>{course.title}</Text>
                      <Text style={{fontSize:16,fontWeight:'600',lineHeight:23,minHeight:30,color:darkMode?'#B4C1D6':'#68758B',marginTop:5}}>{course.desc}</Text>
                      <View style={{marginTop:12,backgroundColor:'#078653',paddingVertical:12,borderRadius:12,alignItems:'center',width:'100%',borderWidth:1,borderColor:'#16A36A'}}>
                        <Text style={{color:'#FFFFFF',fontSize:15,fontWeight:'900',letterSpacing:0.5}}>✓ PURCHASED</Text>
                      </View>
                      {(() => {
                        const purchase = unlockedCourses[course.id] && typeof unlockedCourses[course.id] === 'object'
                          ? unlockedCourses[course.id]
                          : unlockedCourses['ssc-all-subjects-pack'] && typeof unlockedCourses['ssc-all-subjects-pack'] === 'object'
                            ? unlockedCourses['ssc-all-subjects-pack']
                            : null;
                        const purchasedAt = purchase && (purchase.purchaseDate || purchase.unlockedAt);
                        const expiry = purchase && purchase.expiresAt
                          ? new Date(purchase.expiresAt)
                          : purchasedAt
                            ? (() => {
                                const d = new Date(purchasedAt);
                                d.setMonth(d.getMonth() + (Number(purchase.validityMonths) || 6));
                                return d;
                              })()
                            : null;
                        const validExpiry = expiry && !Number.isNaN(expiry.getTime()) ? expiry : null;
                        const daysLeft = validExpiry ? Math.max(0, Math.ceil((validExpiry.getTime() - Date.now()) / 86400000)) : null;
                        const isActive = !!validExpiry && validExpiry.getTime() > Date.now();
                        const formatDate = value => {
                          if (!value) return 'N/A';
                          const d = new Date(value);
                          return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString();
                        };
                        return (
                          <View style={{marginTop:12,padding:14,borderRadius:14,backgroundColor:darkMode?'#172554':'#F3EEFF',borderWidth:1,borderColor:darkMode?'#3B4F85':'#D8CCFF'}}>
                            <Text style={{fontSize:16,lineHeight:24,fontWeight:'700',color:darkMode?'#E0E7FF':'#334155'}}>Purchased: {formatDate(purchasedAt)}</Text>
                            <Text style={{fontSize:16,lineHeight:24,fontWeight:'700',color:darkMode?'#E0E7FF':'#334155'}}>Valid until: {validExpiry ? formatDate(validExpiry) : 'N/A'}</Text>
                            <Text style={{fontSize:16,lineHeight:24,fontWeight:'800',color:isActive?'#078653':'#DC2626'}}>
                              Status: {validExpiry ? (isActive ? 'ACTIVE' : 'EXPIRED') : 'VALIDITY NOT AVAILABLE'}
                            </Text>
                            <Text style={{fontSize:16,lineHeight:24,fontWeight:'800',color:isActive?'#078653':'#DC2626'}}>
                              {daysLeft === null ? 'Remaining days: N/A' : isActive ? 'Days remaining: ' + daysLeft : 'Course expired'}
                            </Text>
                          </View>
                        );
                      })()}
                      <View style={{backgroundColor:darkMode?'#3B82F6':'#2457D6',paddingVertical:15,borderRadius:12,alignItems:'center',marginTop:14,width:'100%',borderWidth:1,borderColor:darkMode?'#60A5FA':'#1D4ED8',elevation:3}}>
                        <Text style={{color:'#FFFFFF',fontWeight:'800'}}>Continue Learning →</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={{margin:16,padding:20,borderRadius:16,backgroundColor:darkMode?'#17243B':'#FFFFFF',alignItems:'center'}}>
                  <Text style={{fontSize:17,fontWeight:'900',color:darkMode?'#F3F6FC':'#173B83',textAlign:'center'}}>No purchased courses yet</Text>
                  <Text style={{fontSize:13,color:darkMode?'#B4C1D6':'#68758B',marginTop:8,textAlign:'center'}}>Your purchased subjects will appear here.</Text>
                </View>
              );
            })()}


          {page === 'Paid Courses' && (
            <View style={{paddingHorizontal:10,flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
              {[
                {title:'SSC Exams',image:require('./assets/images/SSC.png'),target:'SSC Courses',accent:'#2563EB',tint:'#E8F0FF'},
                {title:'TGPSC Exams',image:require('./assets/images/TGPSC.png'),target:'TGPSC Courses',accent:'#7C3AED',tint:'#F0EAFE'},
                {title:'RRB Exams',image:require('./assets/images/RRB.png'),target:'RRB Courses',accent:'#059669',tint:'#DDF8EE'}
              ].map(exam => (
                <TouchableOpacity key={exam.title} onPress={() => setPage(exam.target)}
                  style={{width:'48.5%',backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:18,padding:12,marginTop:14,borderWidth:1,borderColor:darkMode?'#2B3D5C':'#E0E7F2',elevation:3}}>
                  <View style={{height:90,borderRadius:13,backgroundColor:darkMode?exam.accent+'33':exam.tint,alignItems:'center',justifyContent:'center',marginBottom:10}}>
                    <Image source={exam.image} style={{width:'100%',height:'100%'}} resizeMode="contain" />
                  </View>
                  <Text style={{fontSize:15,fontWeight:'900',textAlign:'center',color:'#000000'}}>{exam.title}</Text>
                  <Text style={{fontSize:12,textAlign:'center',marginTop:8,color:darkMode?'#B4C1D6':'#68758B'}}>Explore Exams →</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}


          <View style={{padding:18}}>
            {page === 'SSC Courses' && <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
              {[
                {title:'SSC GD',icon:'🛡️',accent:'#2563EB',tint:'#E8F0FF'},
                {title:'SSC CGL',icon:'🏛️',accent:'#7C3AED',tint:'#F0EAFE'},
                {title:'SSC CHSL',icon:'📋',accent:'#059669',tint:'#DDF8EE'},
                {title:'SSC MTS',icon:'📚',accent:'#D97706',tint:'#FFF0D8'},
                {title:'SSC JE',icon:'⚙️',accent:'#0891B2',tint:'#DDF7FC'},
                {title:'SSC CPO',icon:'👮',accent:'#DB2777',tint:'#FCE7F3'}
              ].map(exam => (
                <TouchableOpacity key={exam.title} onPress={() => setPage('SSC Exam: ' + exam.title)} style={{width:'48.2%',backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:18,padding:screenWidth < 360 ? 7 : 11,marginTop:14,borderWidth:1,borderColor:darkMode?'#2B3D5C':'#E0E7F2',elevation:3}}>
                  <View style={{height:76,borderRadius:13,backgroundColor:darkMode?exam.accent+'33':exam.tint,alignItems:'center',justifyContent:'center',marginBottom:10,overflow:'hidden'}}>
                    <Image source={({
                      'SSC GD':require('./assets/images/ssc-gd.jpeg'),
                      'SSC CGL':require('./assets/images/ssc-cgl.png'),
                      'SSC CHSL':require('./assets/images/ssc-chsl.png'),
                      'SSC MTS':require('./assets/images/ssc-mts.png'),
                      'SSC JE':require('./assets/images/ssc-je.jpeg'),
                      'SSC CPO':require('./assets/images/ssc-cpo.jpeg')
                    })[exam.title]} style={{width:'100%',height:'100%',borderRadius:10}} resizeMode="contain" />
                  </View>
                  <View style={{backgroundColor:darkMode?exam.accent:'#2457D6',borderRadius:12,paddingVertical:11,paddingHorizontal:5,alignItems:'center',justifyContent:'center',marginTop:2}}>
                    <Text style={{fontSize:14,fontWeight:'900',color:'#FFFFFF',textAlign:'center'}}>{exam.title}</Text>
                  </View>
                  <Text style={{fontSize:12,color:darkMode?'#B4C1D6':'#68758B',textAlign:'center',marginTop:7}}>Open Folder →</Text>
                </TouchableOpacity>
              ))}
            </View>}

            {page.startsWith('SSC Exam:') && <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>{[
              {id:'ssc-mathematics',title:'SSC Mathematics',desc:'Arithmetic, algebra and topic-wise practice',price:'₹49',icon:'🧮',accent:'#8B5CF6',tint:'#F0EAFE'},
              {id:'ssc-reasoning-masterclass',title:'SSC Reasoning Masterclass',desc:'Verbal and non-verbal reasoning',price:'₹49',icon:'🧠',accent:'#2563EB',tint:'#E8F0FF'},
              {id:'ssc-general-awareness',title:'SSC General Awareness',desc:'History, geography, polity and science',price:'₹49',icon:'🌍',accent:'#059669',tint:'#DDF8EE'},
              {id:'ssc-english-foundation',title:'SSC English Foundation',desc:'Grammar and vocabulary',price:'₹49',icon:'📚',accent:'#D97706',tint:'#FFF0D8'}
            ].map(course => {
              const courseUnlocked = !!(
                unlockedCourses[course.id] ||
                unlockedCourses['ssc-all-subjects-pack']
              );
              return (
              <View key={course.title} style={{width:'48.2%',backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:18,padding:screenWidth < 360 ? 7 : 11,marginTop:14,borderWidth:1,borderColor:darkMode?'#2B3D5C':'#E0E7F2',elevation:3}}>
                <View style={{height:125,borderRadius:13,backgroundColor:darkMode?course.accent+'33':course.tint,alignItems:'center',justifyContent:'center',marginBottom:10,overflow:'hidden'}}>
    <Image
      source={
        course.title === 'SSC Mathematics'
          ? require('./assets/images/ssc-mathematics.jpeg')
          : course.id === 'ssc-reasoning-masterclass'
          ? require('./assets/images/ssc-reasoning.jpeg')
          : course.id === 'ssc-general-awareness'
          ? require('./assets/images/ssc-general-awareness.jpeg')
          : require('./assets/images/ssc-english.jpeg')
      }
      style={{width:'100%',height:'100%'}}
      resizeMode="cover"
/>
    <View style={{position:'absolute',top:5,right:5,backgroundColor:course.price==='FREE'?'#0D9668':'#D9A323',paddingHorizontal:6,paddingVertical:4,borderRadius:6}}>
      <Text style={{fontSize:9,fontWeight:'900',color:'#35245C'}}>{course.price==='FREE'?'FREE':'PREMIUM'}</Text>
    </View>
  </View>
  <Text style={{fontSize:14,fontWeight:'900',lineHeight:19,minHeight:38,color:'#000000'}}>{course.title}</Text>
                <Text style={{fontSize:11,lineHeight:16,minHeight:48,color:darkMode?'#B4C1D6':'#68758B',marginTop:5}}>{t(course.desc, ({'Arithmetic, algebra and topic-wise practice':'అంకగణితం, బీజగణితం మరియు అంశాల వారీగా సాధన','Verbal and non-verbal reasoning':'వెర్బల్ మరియు నాన్-వెర్బల్ రీజనింగ్','History, geography, polity and science':'చరిత్ర, భూగోళశాస్త్రం, రాజ్యాంగం మరియు సైన్స్','Grammar and vocabulary':'వ్యాకరణం మరియు పదజాలం'})[course.desc] || course.desc)}</Text>
                {!(course.id && courseUnlocked) && (
                  <Text style={{fontSize:16,fontWeight:'900',marginTop:7,color:course.price==='FREE'?'#10B981':(darkMode?'#F6C453':'#B77908')}}>{course.price}</Text>
                )}
                {course.id && courseUnlocked && (
                  <View style={{marginTop:8,marginBottom:2,height:25,borderRadius:7,backgroundColor:'#078653',overflow:'hidden',justifyContent:'center',alignItems:'center'}}>
                    <Text numberOfLines={1} style={{color:'#FFFFFF',fontSize:10,fontWeight:'900'}}>
                      {'✓ PURCHASED'}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => {
                    if (course.id === 'ssc-mathematics') {
                      setPage('Quant Practice');
                    } else if (course.id === 'ssc-reasoning-masterclass') {
                      setPage('Master Reasoning Syllabus');
                    } else if (course.id === 'ssc-general-awareness') {
                      setPage('SSC General Awareness Syllabus');
                    } else if (course.id === 'ssc-english-foundation') {
                      setPage('SSC English Folders');
                    }
                  }}
                  style={{backgroundColor:course.price==='FREE'?'#0D9668':(darkMode?'#2563EB':'#2457D6'),paddingVertical:11,paddingHorizontal:4,borderRadius:10,alignItems:'center',marginTop:10,minHeight:40,justifyContent:'center'}}>
                  <Text style={{color:'#FFFFFF',fontWeight:'800'}}>
                    {course.price === 'FREE' ? t('Start Learning →','నేర్చుకోవడం ప్రారంభించండి →') : courseUnlocked ? t('Continue Learning →','నేర్చుకోవడం కొనసాగించండి →') : t('Buy Course – ₹49 →','కోర్సు కొనండి – ₹49 →')}
                  </Text>
                </TouchableOpacity>
              </View>
            );
            })}

            <View style={{width:'48.2%',backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:18,padding:screenWidth < 360 ? 7 : 11,marginTop:14,borderWidth:1,borderColor:darkMode?'#2B3D5C':'#E0E7F2',elevation:3}}>
              <View style={{height:125,borderRadius:13,backgroundColor:darkMode?'#47356B':'#F0EAFE',alignItems:'center',justifyContent:'center',marginBottom:10,overflow:'hidden'}}>
                <Image source={require('./assets/images/SSC All in one pack.jpeg')} style={{width:'100%',height:'100%'}} resizeMode="cover" />
                <View style={{position:'absolute',top:5,right:5,backgroundColor:'#D9A323',paddingHorizontal:6,paddingVertical:4,borderRadius:6}}>
                  <Text style={{fontSize:9,fontWeight:'900',color:'#35245C'}}>ALL-IN-ONE</Text>
                </View>
              </View>
              <Text style={{fontSize:14,fontWeight:'900',lineHeight:19,minHeight:38,color:'#000000'}}>SSC All Subjects Pack</Text>
              <Text style={{fontSize:11,lineHeight:16,minHeight:48,color:darkMode?'#B4C1D6':'#68758B',marginTop:5}}>Mathematics, Reasoning, General Awareness and English</Text>
              {unlockedCourses['ssc-all-subjects-pack'] ? (
                <View style={{marginTop:8,marginBottom:2,height:25,borderRadius:7,backgroundColor:'#078653',justifyContent:'center',alignItems:'center'}}>
                  <Text style={{color:'#FFFFFF',fontSize:10,fontWeight:'900'}}>✓ PURCHASED</Text>
                </View>
              ) : (
                <Text style={{fontSize:16,fontWeight:'900',marginTop:7,color:darkMode?'#F6C453':'#B77908'}}>₹149</Text>
              )}
              <TouchableOpacity
                onPress={async () => {
                  let checkoutWindow = null;
                  try {
                    if (unlockedCourses['ssc-all-subjects-pack']) {
                      setPage('Quant Practice');
                      return;
                    }
                    if (Platform.OS === 'web') checkoutWindow = window.open('about:blank', '_blank');
                    const user = auth.currentUser;
                    if (!user) throw new Error('Please log in before purchasing.');
                    const token = await user.getIdToken();
                    const response = await fetch('https://' + 'study-with-veer-payment-backend.onrender.com/create-checkout-session', {
                      method: 'POST',
                      headers: {'Content-Type':'application/json','Authorization':'Bearer ' + token},
                      body: JSON.stringify({courseId:'ssc-all-subjects-pack'})
                    });
                    const data = await response.json();
                    if (!response.ok || !data.sessionToken) throw new Error(data.error || 'Could not start checkout.');
                    const checkoutUrl = 'https://' + 'study-with-veer-payment-backend.onrender.com/checkout.html#session=' + encodeURIComponent(data.sessionToken);
                    if (Platform.OS === 'web') {
                      if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.location.href = checkoutUrl;
                      else window.location.href = checkoutUrl;
                    } else {
                      await Linking.openURL(checkoutUrl);
                    }
                  } catch (e) {
                    if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
                    if (Platform.OS === 'web') window.alert('Checkout error: ' + (e.message || String(e)));
                    else Alert.alert('Checkout error', e.message || 'Could not open checkout.');
                  }
                }}
                style={{backgroundColor:darkMode?'#2563EB':'#2457D6',paddingVertical:11,paddingHorizontal:4,borderRadius:10,alignItems:'center',marginTop:10,minHeight:40,justifyContent:'center'}}>
                <Text style={{color:'#FFFFFF',fontWeight:'800',textAlign:'center'}}>
                  {unlockedCourses['ssc-all-subjects-pack'] ? 'Continue Learning →' : 'Buy Pack – ₹149 →'}
                </Text>
              </TouchableOpacity>
            </View>
            </View>}

            {page === 'TGPSC Courses' && <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
            {[
              {title:'Group 1',icon:'🏛️',accent:'#2563EB',tint:'#E8F0FF'},
              {title:'Group 2',icon:'📚',accent:'#7C3AED',tint:'#F0EAFE'},
              {title:'Group 3',icon:'🎯',accent:'#059669',tint:'#DDF8EE'},
              {title:'Group 4',icon:'🏆',accent:'#D97706',tint:'#FFF0D8'}
            ].map(exam => (
              <View key={exam.title} style={{width:'48.2%',backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:18,padding:screenWidth < 360 ? 7 : 11,marginTop:14,borderWidth:1,borderColor:darkMode?'#2B3D5C':'#E0E7F2',elevation:3}}>
                <View style={{height:76,borderRadius:13,backgroundColor:darkMode?exam.accent+'33':exam.tint,alignItems:'center',justifyContent:'center',marginBottom:10,overflow:'hidden'}}>
                  <Image source={require('./assets/images/tgpsc-all-exams.jpeg')} style={{width:'100%',height:'100%'}} resizeMode="cover" />

                </View>
                <Text style={{fontSize:15,fontWeight:'900',color:'#000000',minHeight:38}}>{exam.title}</Text>
                <Text style={{fontSize:11,lineHeight:16,minHeight:48,color:darkMode?'#B4C1D6':'#68758B',marginTop:5}}>{t('Telangana history, polity, economy and general studies','తెలంగాణ చరిత్ర, రాజ్యాంగం, ఆర్థిక వ్యవస్థ మరియు జనరల్ స్టడీస్')}</Text>
                <Text style={{fontSize:16,fontWeight:'900',color:darkMode?'#F6C453':'#B77908',marginTop:7}}>₹49</Text>
                <TouchableOpacity onPress={() => Alert.alert(exam.title + ' course content will be added next.')} style={{backgroundColor:darkMode?'#2563EB':'#2457D6',paddingVertical:11,paddingHorizontal:4,borderRadius:10,alignItems:'center',marginTop:10,minHeight:40,justifyContent:'center'}}>
                  <Text style={{color:'#FFFFFF',fontSize:12,fontWeight:'800',textAlign:'center'}}>{t('Explore Course →','కోర్సును చూడండి →')}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>}

          {page === 'RRB Courses' && <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
            {[
              {title:'RRB NTPC',accent:'#2563EB',tint:'#E8F0FF'},
              {title:'RRB Group D',accent:'#7C3AED',tint:'#F0EAFE'},
              {title:'RRB ALP',accent:'#059669',tint:'#DDF8EE'},
              {title:'RRB Technician',accent:'#D97706',tint:'#FFF0D8'}
            ].map(exam => (
              <TouchableOpacity key={exam.title} onPress={() => setPage('RRB Exam: ' + exam.title)} style={{width:'48.2%',backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:18,padding:screenWidth < 360 ? 7 : 11,marginTop:14,borderWidth:1,borderColor:darkMode?'#2B3D5C':'#E0E7F2',elevation:3}}>
                <View style={{height:76,borderRadius:13,backgroundColor:darkMode?exam.accent+'33':exam.tint,alignItems:'center',justifyContent:'center',marginBottom:10,overflow:'hidden'}}>
                  <Image source={require('./assets/images/rrb-all-exams.jpeg')} style={{width:'100%',height:'100%'}} resizeMode="cover" />
                </View>
                <Text style={{fontSize:15,fontWeight:'900',color:mainText,minHeight:38}}>{exam.title}</Text>
                <Text style={{fontSize:11,lineHeight:16,minHeight:42,color:mutedText,marginTop:5}}>Mathematics, Reasoning, General Science and Awareness</Text>
                <Text style={{fontSize:12,fontWeight:'800',color:'#0D9668',marginTop:7}}>4 Subjects + All-in-One</Text>
                <View style={{backgroundColor:darkMode?'#2563EB':'#2457D6',paddingVertical:11,borderRadius:10,alignItems:'center',marginTop:10}}>
                  <Text style={{color:'#FFFFFF',fontSize:12,fontWeight:'800'}}>Explore Courses →</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>}

          {page.startsWith('RRB Exam:') && (() => {
            const examTitle = page.replace('RRB Exam: ', '');
            const examKey = examTitle === 'RRB NTPC' ? 'rrb-ntpc' : examTitle === 'RRB Group D' ? 'rrb-group-d' : examTitle === 'RRB ALP' ? 'rrb-alp' : 'rrb-technician';
            const packId = examKey + '-all-subjects-pack';
            const subjects = [
              {suffix:'mathematics',title:'Mathematics',icon:'🧮',image:require('./assets/images/rrb mathematics.png'),accent:'#2563EB',tint:'#E8F0FF'},
              {suffix:'reasoning',title:'Reasoning',icon:'🧠',image:require('./assets/images/rrb reasoning.png'),accent:'#7C3AED',tint:'#F0EAFE'},
              {suffix:'general-science',title:'General Science',icon:'🔬',image:require('./assets/images/General Science.png'),accent:'#059669',tint:'#DDF8EE'},
              {suffix:'general-awareness',title:'General Awareness',icon:'🌍',image:require('./assets/images/rrb general awareness.png'),accent:'#D97706',tint:'#FFF0D8'}
            ];
            const packOwned = !!unlockedCourses[packId];
            const startCheckout = async (courseId) => {
              try {
                if (unlockedCourses[courseId] || (courseId !== packId && packOwned)) {
                  Alert.alert('Purchased', 'Purchase verified. Study material PDF mapping will be connected separately.');
                  return;
                }
                const user = auth.currentUser;
                if (!user) throw new Error('Please log in before purchasing.');
                const token = await user.getIdToken();
                const response = await fetch('https://' + 'study-with-veer-payment-backend.onrender.com/create-checkout-session', {
                  method:'POST',
                  headers:{'Content-Type':'application/json','Authorization':'Bearer ' + token},
                  body:JSON.stringify({courseId})
                });
                const data = await response.json();
                if (!response.ok || !data.sessionToken) throw new Error(data.error || 'Could not start checkout.');
                const checkoutUrl = 'https://' + 'study-with-veer-payment-backend.onrender.com/checkout.html#session=' + encodeURIComponent(data.sessionToken);
                if (Platform.OS === 'web') {
                  window.location.href = checkoutUrl;
                } else {
                  await Linking.openURL(checkoutUrl);
                }
              } catch (e) {
                if (Platform.OS === 'web') window.alert('Checkout error: ' + (e.message || String(e)));
                else Alert.alert('Checkout error', e.message || 'Could not open checkout.');
              }
            };
            return <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
              {subjects.map(subject => {
                const courseId = examKey + '-' + subject.suffix;
                const owned = !!(unlockedCourses[courseId] || packOwned);
                return <View key={courseId} style={{width:'48.2%',backgroundColor:cardBg,borderRadius:16,padding:10,marginTop:14,borderWidth:1,borderColor:subject.accent+'66',overflow:'hidden',elevation:3}}>
                  <View style={{height:112,borderRadius:12,backgroundColor:subject.tint,overflow:'hidden',marginBottom:9}}>
                    <Image source={subject.image} style={{width:'100%',height:'100%'}} resizeMode="cover" />
                  </View>
                  <View style={{alignSelf:'flex-start',backgroundColor:subject.tint,borderRadius:8,paddingHorizontal:8,paddingVertical:4}}>
                    <Text style={{fontSize:11,fontWeight:'900',color:subject.accent}}>{subject.icon} RRB SUBJECT</Text>
                  </View>
                  <Text style={{fontSize:14,fontWeight:'900',color:mainText,marginTop:8,minHeight:34}}>{subject.title}</Text>
                  <Text style={{fontSize:12,color:mutedText,marginTop:6}}> {owned ? 'Purchased' : 'Course access: ₹49'} </Text>
                  <TouchableOpacity onPress={() => owned ? Alert.alert('Study material', 'PDF files for this subject still need to be connected.') : startCheckout(courseId)} style={{backgroundColor:owned?'#078653':'#2457D6',padding:10,borderRadius:9,alignItems:'center',marginTop:10}}>
                    <Text style={{color:'#FFFFFF',fontSize:11,fontWeight:'800'}}>{owned ? '✓ PURCHASED' : 'Buy – ₹49'}</Text>
                  </TouchableOpacity>
                </View>;
              })}
              <View style={{width:'100%',backgroundColor:cardBg,borderRadius:18,padding:14,marginTop:16,borderWidth:1,borderColor:'#D9A323',overflow:'hidden',elevation:3}}>
                <Image source={require('./assets/images/All in one rrb.png')} style={{width:'100%',height:155,borderRadius:13,marginBottom:12}} resizeMode="cover" />
                <Text style={{fontSize:18,fontWeight:'900',color:mainText}}>⭐ {examTitle} All-in-One Pack</Text>
                <Text style={{fontSize:12,color:mutedText,marginTop:6}}>Mathematics + Reasoning + General Science + General Awareness</Text>
                <Text style={{fontSize:20,fontWeight:'900',color:darkMode?'#F6C453':'#B77908',marginTop:8}}>₹149</Text>
                <TouchableOpacity onPress={() => startCheckout(packId)} style={{backgroundColor:packOwned?'#078653':'#2457D6',padding:12,borderRadius:10,alignItems:'center',marginTop:10}}>
                  <Text style={{color:'#FFFFFF',fontWeight:'900'}}>{packOwned ? '✓ PACK PURCHASED' : 'Buy All-in-One Pack – ₹149'}</Text>
                </TouchableOpacity>
              </View>
            </View>;
          })()}

          </View>}            <TouchableOpacity
              onPress={() => setPage(page.startsWith('SSC Exam:') ? 'SSC Courses' : page.startsWith('RRB Exam:') ? 'RRB Courses' : page === 'RRB Courses' ? 'Paid Courses' : (page === 'Courses' || page === 'Paid Courses') ? 'Home' : 'Paid Courses')}
              style={{width:'100%',alignSelf:'stretch',paddingVertical:17,paddingHorizontal:12,marginTop:24,marginBottom:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center',minHeight:58}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>
                ← {page === 'Courses' ? t('Back to Home','హోమ్‌కు తిరిగి వెళ్లండి') : page.startsWith('SSC Exam:') ? t('Back to SSC Folders','SSC ఫోల్డర్లకు తిరిగి వెళ్లండి') : t('All Exam Categories','అన్ని పరీక్షల విభాగాలు')}
              </Text>
            </TouchableOpacity>

        </>}

        {page === 'Free Courses' && <>
          <View style={{padding:18}}>

            <Text style={[styles.pageTitle,{color:mainText,marginTop:8}]}>Free Courses</Text>
            <Text style={{color:mutedText,marginTop:5}}>Learn for free with these courses.</Text>
            {[

            ].map(course => (
              <View key={course.title} style={{backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:18,padding:16,marginTop:16,borderWidth:1,borderColor:darkMode?'#2B3D5C':'#DCE5F5'}}>
                <View style={{flexDirection:'row',alignItems:'center'}}>
                  <Text style={{fontSize:32,marginRight:12}}>{course.icon}</Text>
                  <View style={{flex:1}}>
                    <Text style={{fontSize:16,fontWeight:'900',color:mainText}}>{course.title}</Text>
                    <Text style={{fontSize:12,color:mutedText,marginTop:5}}>{course.desc}</Text>
                  </View>
                  <Text style={{color:'#0D9668',fontWeight:'900'}}>FREE</Text>
                </View>
                <TouchableOpacity onPress={course.action} style={{backgroundColor:'#0D9668',padding:12,borderRadius:10,alignItems:'center',marginTop:15}}>
                  <Text style={{color:'#FFFFFF',fontWeight:'800'}}>Start Learning →</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity onPress={() => setPage('Home')} style={{width:'100%',alignSelf:'stretch',paddingVertical:17,paddingHorizontal:12,marginTop:24,marginBottom:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to Home</Text>
            </TouchableOpacity>
          </View>
        </>}

        {page === 'SSC English Folders' && !(unlockedCourses['ssc-english-foundation'] || unlockedCourses['ssc-all-subjects-pack']) && <>
          <View style={{padding:24,alignItems:'center'}}>
            <Text style={[styles.pageTitle,{color:mainText,textAlign:'center'}]}>SSC English Foundation Locked</Text>
            <Text style={{color:mutedText,textAlign:'center',marginTop:10}}>Purchase this course for ₹49 to access English topics and study materials.</Text>
            <TouchableOpacity onPress={async () => {
  let checkoutWindow = null;
  try {
    if (Platform.OS === 'web') checkoutWindow = window.open('about:blank', '_blank');
    const user = auth.currentUser;
    if (!user) throw new Error('Please log in before purchasing.');

    const token = await user.getIdToken();
    const response = await fetch('https://' + 'study-with-veer-payment-backend.onrender.com/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ courseId: 'ssc-english-foundation' })
    });
    const data = await response.json();
    if (!response.ok || !data.sessionToken) throw new Error(data.error || 'Could not start checkout.');

    const checkoutUrl = 'https://' + 'study-with-veer-payment-backend.onrender.com/checkout.html#session=' + encodeURIComponent(data.sessionToken);
    if (Platform.OS === 'web') {
      if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.location.href = checkoutUrl;
      else window.location.href = checkoutUrl;
    } else {
      await Linking.openURL(checkoutUrl);
    }
  } catch (e) {
    if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
    if (Platform.OS === 'web') window.alert('Checkout error: ' + (e.message || String(e)));
    else Alert.alert(e.message || 'Could not open checkout.');
  }
}} style={{backgroundColor:'#2457D6',padding:15,borderRadius:12,marginTop:20,width:'100%',alignItems:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900'}}>Buy for ₹49 →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPage('Home')} style={{width:'100%',alignSelf:'stretch',paddingVertical:17,paddingHorizontal:12,marginTop:24,marginBottom:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to Home</Text>
            </TouchableOpacity>
          </View>
        </>}

        {page === 'SSC English Folders' && (unlockedCourses['ssc-english-foundation'] || unlockedCourses['ssc-all-subjects-pack']) && <>
          <View style={{padding:18}}>

            <Text style={[styles.pageTitle,{color:mainText,marginTop:8}]}>SSC English Foundation</Text>
            <Text style={{color:mutedText,marginTop:5}}>English Syllabus • Topic-wise Folders</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginTop:12}}>
              {[
  'Articles','Nouns','Pronouns','Verbs','Tenses',
              'Subject-Verb Agreement','Adjectives & Adverbs','Conjunctions',
              'Active & Passive Voice','Cloze Test','Question Tags',].map((topic,index) => (
              <TouchableOpacity key={topic} onPress={() => setPage('SSC English Topic: '+topic)}
                style={{width:'48.5%',minHeight:132,padding:12,marginBottom:12,borderRadius:16,backgroundColor:darkMode?'#17243B':'#FFFFFF',borderWidth:1,borderColor:darkMode?'#2B3D5C':'#DCE5F5'}}>
                <View style={{width:42,height:42,borderRadius:12,backgroundColor:darkMode?'#1D3760':'#E8EEFF',alignItems:'center',justifyContent:'center',marginBottom:10}}>
                  <Text style={{fontSize:19,fontWeight:'900',color:darkMode?'#AFC8FF':'#2457D6'}}>{['📘','📝','📚','✍️','⏳','🎯','🔤','🔗','📖','🧩','❓'][index]}</Text>
                </View>
                <Text style={{fontSize:14,fontWeight:'800',lineHeight:19,color:mainText}}>{topic}</Text>
                <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:8}}>
                  <Text style={{fontSize:11,fontWeight:'700',color:mutedText}}>Study Notes PDF</Text>
                  <Text style={{fontSize:19,color:'#2457D6'}}>›</Text>
                </View>
              </TouchableOpacity>
            ))}
            </View>

<TouchableOpacity onPress={() => setPage('Courses')} style={{width:'100%',alignSelf:'stretch',paddingVertical:17,paddingHorizontal:12,marginTop:24,marginBottom:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to English Courses</Text>
            </TouchableOpacity>
</View>
        </>}


        {page.startsWith('SSC English Topic: ') && !(unlockedCourses['ssc-english-foundation'] || unlockedCourses['ssc-all-subjects-pack']) && <>
          <View style={{padding:24,alignItems:'center'}}>
            <Text style={[styles.pageTitle,{color:mainText,textAlign:'center'}]}>Course Locked</Text>
            <Text style={{color:mutedText,textAlign:'center',marginTop:10}}>Buy SSC English Foundation for ₹49 to access this topic.</Text>
            <TouchableOpacity onPress={() => setPage('SSC Exam: English')} style={{backgroundColor:'#2457D6',padding:15,borderRadius:12,marginTop:20,width:'100%',alignItems:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900'}}>Buy for ₹49 →</Text>
            </TouchableOpacity>


<TouchableOpacity onPress={() => setPage('SSC English Folders')} style={{width:'100%',alignSelf:'stretch',paddingVertical:17,paddingHorizontal:12,marginTop:24,marginBottom:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to English Folders</Text>
            </TouchableOpacity>
</View>
        </>}

        {page.startsWith('SSC English Topic: ') && (unlockedCourses['ssc-english-foundation'] || unlockedCourses['ssc-all-subjects-pack']) && <>
          <View style={{padding:22}}>
            <Text style={[styles.pageTitle,{color:mainText}]}>
              {page.replace('SSC English Topic: ', '')}
            </Text>
            <Text style={{color:mutedText,marginTop:8,lineHeight:22}}>
              Open your topic-wise English study PDF from Supabase.
            </Text>

            <View style={{flexDirection:'row',gap:10,marginTop:24,alignItems:'stretch'}}>
            <TouchableOpacity
              disabled={pdfDownloadBusy}
              onPress={async () => {
                const topic = page.replace('SSC English Topic: ', '');
                const endpoint = topic === 'Articles'
                  ? ARTICLES_API + '/english/articles-full-url'
                  : ARTICLES_API + '/english/topic-pdf-url?topic=' + encodeURIComponent(topic);
                const tab = Platform.OS === 'web' ? window.open('about:blank', '_blank') : null;
                try {
                  const user = auth.currentUser;
                  if (!user) throw new Error('Please log in again.');
                  const token = await user.getIdToken();
                  const response = await fetch(endpoint, {
                    headers: { Authorization: 'Bearer ' + token }
                  });
                  const data = await response.json();
                  if (!response.ok || !data.url) {
                    throw new Error(data.error || 'Could not open this PDF.');
                  }
                  if (Platform.OS === 'web') {
                    if (tab) tab.location.href = data.url;
                    else {
                      const link = document.createElement('a');
                      link.href = data.url;
                      link.target = '_blank';
                      link.rel = 'noopener noreferrer';
                      link.click();
                    }
                  } else {
                    await Linking.openURL(data.url);
                  }
                } catch (error) {
                  if (tab) tab.close();
                  Alert.alert('Could not open PDF', error.message || 'Please try again.');
                }
              }}
              style={{flex:1,backgroundColor:'#087F67',paddingVertical:16,paddingHorizontal:6,borderRadius:14,alignItems:'center'}}>
              <Text style={{color:'#FFFFFF',fontSize:16,fontWeight:'900'}}>
                📖 View
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={pdfDownloadBusy}
              onPress={async () => {
                const topic = page.replace('SSC English Topic: ', '');
                const endpoint = topic === 'Articles'
                  ? ARTICLES_API + '/english/articles-full-url'
                  : ARTICLES_API + '/english/topic-pdf-url?topic=' + encodeURIComponent(topic);
                const fileName = 'English-' + topic.replace(/[^a-zA-Z0-9_-]/g, '-') + '.pdf';
                await downloadStudyPdfForOffline(endpoint, fileName);
              }}
              style={{flex:1,backgroundColor:pdfDownloadBusy?'#94A3B8':'#2457D6',paddingVertical:16,paddingHorizontal:6,borderRadius:14,alignItems:'center'}}>
              <Text style={{color:'#FFFFFF',fontSize:16,fontWeight:'900'}}>
                {pdfDownloadBusy ? '⏳ Downloading PDF...' : '📥 Download Offline'}
              </Text>
            </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setPage('SSC English Folders')}
              style={{padding:16,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',marginTop:16}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to English Folders</Text>
            </TouchableOpacity>
          </View>
        </>}

        {page === 'SSC General Awareness Syllabus' && <>
          <View style={{padding:18}}>


            <Text style={{fontSize:25,fontWeight:'900',color:mainText}}>🌍 SSC General Awareness</Text>
            <Text style={{fontSize:14,color:mutedText,marginTop:6,marginBottom:18}}>Subject Syllabus • Topic-wise Folders</Text>

            <Text style={{color:mutedText,fontSize:11,marginBottom:8}}>
              Debug: General Awareness {unlockedCourses['ssc-general-awareness'] ? 'UNLOCKED' : 'LOCKED'}
            </Text>

            {!(unlockedCourses['ssc-general-awareness'] || unlockedCourses['ssc-all-subjects-pack']) && (
              <TouchableOpacity
                onPress={async () => {
                  let checkoutWindow = null;
                  try {
                    if (Platform.OS === 'web') checkoutWindow = window.open('about:blank', '_blank');
                    const user = auth.currentUser;
                    if (!user) throw new Error('Please log in before purchasing.');
                    const idToken = await user.getIdToken();
                    const response = await fetch(
                      'https://' + 'study-with-veer-payment-backend.onrender.com/create-checkout-session',
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': 'Bearer ' + idToken
                        },
                        body: JSON.stringify({courseId:'ssc-general-awareness'})
                      }
                    );
                    const data = await response.json();
                    if (!response.ok || !data.sessionToken) {
                      throw new Error(data.error || 'Could not start secure checkout.');
                    }
                    const checkoutUrl = 'https://' + 'study-with-veer-payment-backend.onrender.com/checkout.html#session=' + encodeURIComponent(data.sessionToken);
                    if (Platform.OS === 'web') {
                      if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.location.href = checkoutUrl;
                      else window.location.href = checkoutUrl;
                    } else {
                      await Linking.openURL(checkoutUrl);
                    }
                  } catch (error) {
                    if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
                    if (Platform.OS === 'web') window.alert('Checkout error: ' + (error.message || 'Please try again.'));
                    else Alert.alert('Checkout error', error.message || 'Please try again.');
                  }
                }}
                style={{backgroundColor:'#2457D6',padding:16,borderRadius:14,alignItems:'center',marginBottom:20}}>
                <Text style={{color:'#FFFFFF',fontSize:16,fontWeight:'900'}}>Buy for ₹49 — General Awareness</Text>
                <Text style={{color:'#FFFFFF',fontSize:12,marginTop:5}}>Secure checkout • Unlock premium materials</Text>
              </TouchableOpacity>
            )}

            {!(unlockedCourses['ssc-general-awareness'] || unlockedCourses['ssc-all-subjects-pack']) ? (
              <Text style={{color:mutedText,marginBottom:14}}>
                Purchase the course to unlock folders and study materials.
              </Text>
            ) : generalAwarenessLoading ? (
              <Text style={{color:mutedText,marginBottom:14}}>Loading folders from Supabase...</Text>
            ) : generalAwarenessError ? (
              <Text style={{color:'#DC2626',marginBottom:14}}>{generalAwarenessError}</Text>
            ) : generalAwarenessFolders.length === 0 ? (
              <Text style={{color:mutedText,marginBottom:14}}>
                No folders found in the General Awareness bucket yet.
              </Text>
            ) : generalAwarenessFolders.map((folder, index) => {
              const colors = ['#B45309','#7C3AED','#059669','#2563EB','#0891B2','#DB2777'];
              const color = colors[index % colors.length];
              return (
                <TouchableOpacity key={folder.name}
                  onPress={() => setPage('SSC General Awareness Topic: ' + folder.name)}
                  style={{marginBottom:14,borderRadius:18,backgroundColor:darkMode?'#172033':'#FFFFFF',borderWidth:1,borderColor:color+'66',borderBottomWidth:4,borderBottomColor:color,elevation:4,overflow:'hidden'}}>
                  <View style={{flexDirection:'row',alignItems:'center',padding:14}}>
                    <View style={{width:60,height:60,borderRadius:14,backgroundColor:color+'20',alignItems:'center',justifyContent:'center',marginRight:12,borderWidth:1,borderColor:color+'55'}}>
                      <Text style={{fontSize:27}}>📁</Text>
                      <Text style={{fontSize:9,fontWeight:'900',color:color}}>FOLDER {index + 1}</Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={{fontSize:15,fontWeight:'900',color:mainText}}>{folder.name.toLowerCase() === 'gk' ? 'Static General Knowledge' : folder.name}</Text>
                      <Text style={{fontSize:12,color:mutedText,marginTop:4}}>Open folder to view PDF notes</Text>
                      <Text style={{fontSize:11,fontWeight:'900',color:'#059669',marginTop:7}}>🔓 UNLOCKED</Text>
                    </View>
                    <Text style={{fontSize:22,color:color}}>›</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={() => setPage('Courses')}
              style={{width:'100%',alignSelf:'stretch',marginTop:24,marginBottom:12,paddingVertical:17,paddingHorizontal:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center'}}
            >
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to Courses</Text>
            </TouchableOpacity>
          </View>
        </>}

        {page.startsWith('SSC General Awareness Topic: ') && <>
          <View style={{padding:20}}>


            <Text style={{fontSize:23,fontWeight:'900',color:mainText}}>
              {page.replace('SSC General Awareness Topic: ','')}
            </Text>

            {(unlockedCourses['ssc-general-awareness'] || unlockedCourses['ssc-all-subjects-pack']) ? <>
              <Text style={{fontSize:14,color:'#059669',fontWeight:'900',marginTop:10}}>🔓 COURSE ACCESS UNLOCKED</Text>
              <Text style={{fontSize:14,color:mutedText,marginTop:8,lineHeight:22}}>This topic is included in your purchased course. Detailed lesson notes, PDFs and videos need to be added to this topic separately.</Text>
              {/* GENERAL_AWARENESS_PDF_LIST_UI */}
              <View style={{marginTop:18}}>
                <Text style={{fontSize:18,fontWeight:'900',color:mainText}}>📄 PDF Notes</Text>
                <Text style={{fontSize:12,color:mutedText,marginTop:5}}>Your topic-wise study materials</Text>

                {generalAwarenessLoading ? (
                  <Text style={{color:mutedText,marginTop:14}}>Loading PDFs...</Text>
                ) : generalAwarenessError ? (
                  <Text style={{color:'#DC2626',marginTop:14}}>{generalAwarenessError}</Text>
                ) : generalAwarenessFiles.length > 0 ? (
                  generalAwarenessFiles.map(item => {
                    const folder = page.replace('SSC General Awareness Topic: ', '');
                    const endpoint = ARTICLES_API + '/general-awareness/topic-pdf-url?topic=' +
                      encodeURIComponent(folder) + '&file=' + encodeURIComponent(item.name);
                    const fileName = 'GA-' + folder.replace(/[^a-zA-Z0-9_-]/g, '-') + '-' +
                      item.name.replace(/[^a-zA-Z0-9._-]/g, '_');

                    return (
                      <View
                        key={item.name}
                        style={{padding:14,marginTop:12,borderRadius:14,backgroundColor:cardBg,borderWidth:1,borderColor:darkMode?'#475569':'#D8E1EF'}}
                      >
                        <Text style={{fontSize:15,fontWeight:'900',color:mainText,marginBottom:12}}>
                          📄 {item.name}
                        </Text>

                        <View style={{flexDirection:'row',gap:10}}>
                          <TouchableOpacity
                            disabled={pdfDownloadBusy}
                            onPress={async () => {
                              const tab = Platform.OS === 'web' ? window.open('about:blank', '_blank') : null;
                              try {
                                const user = auth.currentUser;
                                if (!user) throw new Error('Please log in again.');
                                const token = await user.getIdToken();
                                const response = await fetch(endpoint, {
                                  headers:{Authorization:'Bearer ' + token}
                                });
                                const data = await response.json();
                                if (!response.ok || !data.url) {
                                  throw new Error(data.error || 'Could not open this PDF.');
                                }
                                if (Platform.OS === 'web') {
                                  if (tab) tab.location.href = data.url;
                                  else {
                                    const link = document.createElement('a');
                                    link.href = data.url;
                                    link.target = '_blank';
                                    link.rel = 'noopener noreferrer';
                                    link.click();
                                  }
                                } else {
                                  await Linking.openURL(data.url);
                                }
                              } catch (error) {
                                if (tab) tab.close();
                                Alert.alert('Could not open PDF', error.message || 'Please try again.');
                              }
                            }}
                            style={{flex:1,backgroundColor:'#087F67',paddingVertical:14,paddingHorizontal:4,borderRadius:12,alignItems:'center',justifyContent:'center'}}
                          >
                            <Text style={{color:'#FFFFFF',fontSize:14,fontWeight:'900'}}>📖 View</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            disabled={pdfDownloadBusy}
                            onPress={() => downloadStudyPdfForOffline(endpoint, fileName)}
                            style={{flex:1,backgroundColor:pdfDownloadBusy?'#94A3B8':'#2457D6',paddingVertical:14,paddingHorizontal:4,borderRadius:12,alignItems:'center',justifyContent:'center'}}
                          >
                            <Text style={{color:'#FFFFFF',fontSize:13,fontWeight:'900'}}>
                              {pdfDownloadBusy ? '⏳ Downloading...' : '📥 Download Offline'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={{fontSize:13,color:mutedText,marginTop:12}}>
                    'No PDF files found in this folder yet.'
                  </Text>
                )}
              </View>

              <TouchableOpacity
                onPress={() => setPage('SSC General Awareness Syllabus')}
                style={{width:'100%',alignSelf:'stretch',marginTop:22,marginBottom:12,paddingVertical:17,paddingHorizontal:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center'}}
              >
                <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to General Awareness Course</Text>
              </TouchableOpacity>
            </> : <>

              <TouchableOpacity onPress={() => setPage('SSC General Awareness Syllabus')}
                style={{width:'100%',alignSelf:'stretch',marginTop:24,marginBottom:12,paddingVertical:16,paddingHorizontal:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center'}}>
                <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to Syllabus</Text>
              </TouchableOpacity>
            </>}
          </View>
        </>}

        {page === 'Master Reasoning Syllabus' && <>
          <View style={{padding:18}}>


            <Text style={{fontSize:25,fontWeight:'900',color:mainText}}>🧠 SSC Reasoning Masterclass</Text>
            <Text style={{fontSize:14,color:mutedText,marginTop:6,marginBottom:18}}>Subject Syllabus • Topic-wise Folders</Text>

            {!(unlockedCourses['ssc-reasoning-masterclass'] || unlockedCourses['ssc-all-subjects-pack']) && (
              <TouchableOpacity
                onPress={async () => {
                  try {
                    const user = auth.currentUser;
                    if (!user) {
                      Alert.alert('Please log in', 'Purchase cheyyadaniki mundu login avvandi.');
                      return;
                    }

                    const idToken = await user.getIdToken();
                    const response = await fetch(
                      "https://" + "study-with-veer-payment-backend.onrender.com/create-checkout-session",
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': 'Bearer ' + idToken
                        },
                        body: JSON.stringify({ courseId: 'ssc-reasoning-masterclass' })
                      }
                    );

                    const data = await response.json();
                    if (!response.ok || !data.sessionToken) {
                      throw new Error(data.error || 'Could not start secure checkout.');
                    }

                    await Linking.openURL(
                      "https://" + "study-with-veer-payment-backend.onrender.com/checkout.html#session=" +
                      encodeURIComponent(data.sessionToken)
                    );
                  } catch (error) {
                    Alert.alert('Checkout error', error.message || 'Please try again.');
                  }
                }}
                style={{backgroundColor:'#2457D6',padding:16,borderRadius:14,alignItems:'center',marginBottom:20}}
              >
                <Text style={{color:'#FFFFFF',fontSize:16,fontWeight:'900'}}>Buy for ₹49 — Reasoning Syllabus</Text>
                <Text style={{color:'#FFFFFF',fontSize:12,marginTop:5}}>Secure checkout • Unlock premium materials</Text>
              </TouchableOpacity>
            )}

            <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
            {[
              {title:'Analogy',desc:'Word, Number and Figure Analogy',icon:'🔗',color:'#6344E8'},
              {title:'Blood Relations',desc:'Family Relationships',icon:'👨‍👩‍👧',color:'#DB2777'},
              {title:'Calendar',desc:'Days, Dates and Calendar Questions',icon:'📅',color:'#2563EB'},
              {title:'Coding and Decoding',desc:'Letter and Number Codes',icon:'🔐',color:'#0891B2'},
              {title:'Dice',desc:'Dice and Cube Questions',icon:'🎲',color:'#D97706'},
              {title:'Directions',desc:'Directions and Distance',icon:'🧭',color:'#059669'},
              {title:'Seating Arrangement',desc:'Linear and Circular Seating',icon:'🪑',color:'#DB2777'},
              {title:'Venn Diagram',desc:'Groups and Relationships',icon:'⭕',color:'#2563EB'}
            ].map((folder,index) => {
              const unlocked = !!(unlockedCourses['ssc-reasoning-masterclass'] || unlockedCourses['ssc-all-subjects-pack']);
              return (
                <TouchableOpacity key={folder.title}
                  onPress={() => {
                    setPage('Master Reasoning Topic: ' + folder.title);
                  }}
                  style={{width:'48.5%',marginBottom:12,borderRadius:16,backgroundColor:darkMode?'#172033':'#FFFFFF',borderWidth:1,borderColor:darkMode?'#2B3D5C':'#DCE5F5',overflow:'hidden'}}>
                  <View style={{padding:12,minHeight:174}}>
                    <View style={{width:44,height:44,borderRadius:12,backgroundColor:folder.color+'20',alignItems:'center',justifyContent:'center',marginBottom:10}}>
                      <Text style={{fontSize:24}}>{folder.icon}</Text>
                    </View>
                    <Text style={{fontSize:14,fontWeight:'900',color:mainText,lineHeight:19}}>{folder.title}</Text>
                    <Text style={{fontSize:11,color:mutedText,marginTop:5,lineHeight:15}}>{folder.desc}</Text>
                    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:10}}>
                      <Text style={{fontSize:10,fontWeight:'900',color:unlocked?'#059669':'#D97706',flex:1}}>{unlocked?'🔓 UNLOCKED':'🔒 LOCKED · ₹49'}</Text>
                      <Text style={{fontSize:20,color:folder.color}}>{unlocked?'›':'🔒'}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            </View>
            <TouchableOpacity
              onPress={() => setPage('SSC Courses')}
              style={{width:'100%',marginTop:8,marginBottom:4,paddingVertical:16,paddingHorizontal:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center'}}
            >
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to SSC Folder</Text>
            </TouchableOpacity>
          </View>
        </>}

        {page.startsWith('Master Reasoning Topic: ') && <>
          <View style={{padding:20}}>
            <TouchableOpacity onPress={() => setPage('Master Reasoning Syllabus')}
              style={{padding:14,borderRadius:13,backgroundColor:darkMode?'#173B35':'#E3F4EE',alignItems:'center',marginBottom:20}}>
              <Text style={{color:darkMode?'#6EE7B7':'#087F67',fontWeight:'900'}}>← Back to Reasoning Syllabus</Text>
            </TouchableOpacity>
            {(unlockedCourses['ssc-reasoning-masterclass'] || unlockedCourses['ssc-all-subjects-pack']) ? <>
              {(() => {
                const topic = page.replace('Master Reasoning Topic: ', '');
                const endpoint = ARTICLES_API + '/reasoning/topic-pdf-url?topic=' + encodeURIComponent(topic);
                return <>
                  <Text style={{fontSize:24,fontWeight:'900',color:mainText}}>{topic}</Text>
                  <Text style={{fontSize:14,color:mutedText,marginTop:8,marginBottom:18}}>SSC Reasoning Study PDF</Text>
                  <TouchableOpacity
                    onPress={async () => {
                      let pdfWindow = null;
                      try {
                        if (Platform.OS === 'web') pdfWindow = window.open('about:blank', '_blank');
                        const user = auth.currentUser;
                        if (!user) throw new Error('Please log in again.');
                        const token = await user.getIdToken();
                        const response = await fetch(endpoint, {headers:{Authorization:'Bearer ' + token}});
                        const data = await response.json();
                        if (!response.ok || !data.url) throw new Error(data.error || 'Could not open this PDF.');
                        if (Platform.OS === 'web') {
                          if (pdfWindow && !pdfWindow.closed) pdfWindow.location.href = data.url;
                          else window.location.href = data.url;
                        } else {
                          await Linking.openURL(data.url);
                        }
                      } catch (e) {
                        if (pdfWindow && !pdfWindow.closed) pdfWindow.close();
                        const message = e.message || 'Could not open this PDF.';
                        if (Platform.OS === 'web') window.alert('PDF error: ' + message);
                        else Alert.alert('PDF error', message);
                      }
                    }}
                    style={{backgroundColor:'#087F67',paddingVertical:16,paddingHorizontal:12,borderRadius:14,alignItems:'center',marginBottom:12}}>
                    <Text style={{color:'#FFFFFF',fontSize:16,fontWeight:'900'}}>📖 View PDF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={pdfDownloadBusy}
                    onPress={() => downloadStudyPdfForOffline(endpoint, 'Reasoning-' + topic.replace(/[^a-zA-Z0-9_-]/g, '-') + '.pdf')}
                    style={{backgroundColor:pdfDownloadBusy?'#94A3B8':'#2457D6',paddingVertical:16,paddingHorizontal:12,borderRadius:14,alignItems:'center'}}>
                    <Text style={{color:'#FFFFFF',fontSize:15,fontWeight:'900'}}>
                      {pdfDownloadBusy ? '⏳ Downloading...' : '📥 Download Offline'}
                    </Text>
                  </TouchableOpacity>
                </>;
              })()}
            </> : <>
              <Text style={{fontSize:22,fontWeight:'900',color:mainText,textAlign:'center'}}>🔒 SSC Reasoning Locked</Text>
              <Text style={{fontSize:15,color:mutedText,textAlign:'center',marginTop:10}}>Purchase SSC Reasoning for ₹49, or unlock with the All Subjects Pack, to access topic PDFs.</Text>
              <TouchableOpacity onPress={() => setPage('Courses')} style={{marginTop:20,padding:14,backgroundColor:'#2457D6',borderRadius:12,alignItems:'center'}}>
                <Text style={{color:'#FFFFFF',fontWeight:'900'}}>View Courses</Text>
              </TouchableOpacity>
            </>}
            <TouchableOpacity
              onPress={() => setPage('Courses')}
              style={{width:'100%',alignSelf:'stretch',marginTop:24,marginBottom:12,paddingVertical:17,paddingHorizontal:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to Courses</Text>
            </TouchableOpacity>
          </View>
        </>}

        {page === 'Quant Practice' && !(unlockedCourses['ssc-mathematics'] || unlockedCourses['ssc-all-subjects-pack']) && <>
          <View style={{padding:24,alignItems:'center'}}>
            <Text style={[styles.pageTitle,{color:mainText,textAlign:'center'}]}>🔒 SSC Mathematics Locked</Text>
            <Text style={{color:mutedText,textAlign:'center',marginTop:10}}>Purchase SSC Mathematics for ₹49 to unlock all topic-wise practice folders.</Text>
            <TouchableOpacity onPress={async () => {
              let checkoutWindow = null;
              try {
                if (Platform.OS === 'web') checkoutWindow = window.open('about:blank', '_blank');
                const user = auth.currentUser;
                if (!user) throw new Error('Please log in before purchasing.');
                const token = await user.getIdToken();
                const response = await fetch('https://' + 'study-with-veer-payment-backend.onrender.com/create-checkout-session', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                  body: JSON.stringify({ courseId: 'ssc-mathematics' })
                });
                const data = await response.json();
                if (!response.ok || !data.sessionToken) throw new Error(data.error || 'Could not start checkout.');
                const checkoutUrl = 'https://' + 'study-with-veer-payment-backend.onrender.com/checkout.html#session=' + encodeURIComponent(data.sessionToken);
                if (Platform.OS === 'web') {
                  if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.location.href = checkoutUrl;
                  else window.location.href = checkoutUrl;
                } else {
                  await Linking.openURL(checkoutUrl);
                }
              } catch (e) {
                if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
                if (Platform.OS === 'web') window.alert('Checkout error: ' + (e.message || String(e)));
                else Alert.alert(e.message || 'Could not open checkout.');
              }
            }} style={{backgroundColor:'#2457D6',padding:15,borderRadius:12,marginTop:20,width:'100%',alignItems:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900'}}>Buy for ₹49 →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPage('Courses')} style={{paddingVertical:16,paddingHorizontal:18,marginTop:20,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',width:'100%'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900'}}>← Back to Courses</Text>
            </TouchableOpacity>
          </View>
        </>}

        {page === 'Quant Practice' && (unlockedCourses['ssc-mathematics'] || unlockedCourses['ssc-all-subjects-pack']) && <>
          <View style={{padding:18}}>
            <Text style={{fontSize:25,fontWeight:'900',color:mainText,marginTop:8}}>
              SSC Mathematics
            </Text>
            <Text style={{fontSize:14,color:mutedText,marginTop:8,lineHeight:22}}>
              Topic-wise Study Notes • View PDFs or download for offline study.
            </Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
              {[
                'Percentage',
                'Ratio & Proportion',
                'Average',
                'Profit & Loss',
                'Discount',
                'Simple Interest',
                'Time & Work',
                'Pipes & Cisterns',
                'Partnership',
                'Boats & Streams',
                'Ages',
                'Chain Rule',
                'Problems on Trains'
              ].map((topic,index) => (
                <TouchableOpacity key={topic}
                  onPress={() => setPage('SSC Mathematics Topic: '+topic)}
                  style={{width:'48.2%',minHeight:112,backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:15,padding:12,marginTop:12,borderWidth:1,borderColor:darkMode?'#2B3D5C':'#DCE5F5',justifyContent:'space-between'}}>
                  <View style={{width:32,height:32,borderRadius:9,backgroundColor:darkMode?'#173D35':'#E3F4EE',alignItems:'center',justifyContent:'center'}}>
                    <Text style={{fontWeight:'900',color:darkMode?'#6EE7B7':'#087F67'}}>{index+1}</Text>
                  </View>
                  <Text style={{fontSize:14,fontWeight:'800',color:mainText,marginTop:12}}>{topic}</Text>
                  <Text style={{fontSize:12,color:darkMode?'#6EE7B7':'#087F67',marginTop:6}}>📄 Open Study PDF →</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setPage('Courses')}
              style={{marginTop:24,paddingVertical:16,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to Courses</Text>
            </TouchableOpacity>
          </View>
        </>}

        {page.startsWith('SSC Mathematics Topic: ') && (unlockedCourses['ssc-mathematics'] || unlockedCourses['ssc-all-subjects-pack']) && <>
          <View style={{padding:22}}>
            <Text style={[styles.pageTitle,{color:mainText}]}>
              {page.replace('SSC Mathematics Topic: ', '')}
            </Text>
            <Text style={{color:mutedText,marginTop:8,lineHeight:22}}>
              Open or download your Mathematics study PDF from Supabase.
            </Text>
            <View style={{flexDirection:'row',gap:10,marginTop:24,alignItems:'stretch'}}>
              <TouchableOpacity
                disabled={pdfDownloadBusy}
                onPress={async () => {
                  const topic = page.replace('SSC Mathematics Topic: ', '');
                  const endpoint = ARTICLES_API + '/mathematics/topic-pdf-url?topic=' + encodeURIComponent(topic);
                  const tab = Platform.OS === 'web' ? window.open('about:blank', '_blank') : null;
                  try {
                    const user = auth.currentUser;
                    if (!user) throw new Error('Please log in again.');
                    const token = await user.getIdToken();
                    const response = await fetch(endpoint, {
                      headers: {Authorization:'Bearer '+token}
                    });
                    const data = await response.json();
                    if (!response.ok || !data.url) throw new Error(data.error || 'Could not open this PDF.');
                    if (Platform.OS === 'web') {
                      if (tab) tab.location.href = data.url;
                      else window.open(data.url, '_blank', 'noopener,noreferrer');
                    } else {
                      await Linking.openURL(data.url);
                    }
                  } catch (error) {
                    if (tab) tab.close();
                    Alert.alert('Could not open PDF', error.message || 'Please try again.');
                  }
                }}
                style={{flex:1,backgroundColor:'#087F67',paddingVertical:16,paddingHorizontal:6,borderRadius:14,alignItems:'center'}}>
                <Text style={{color:'#FFFFFF',fontSize:15,fontWeight:'900'}}>📖 View PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={pdfDownloadBusy}
                onPress={async () => {
                  const topic = page.replace('SSC Mathematics Topic: ', '');
                  const endpoint = ARTICLES_API + '/mathematics/topic-pdf-url?topic=' + encodeURIComponent(topic);
                  const fileName = 'Mathematics-' + topic.replace(/[^a-zA-Z0-9_-]/g, '-') + '.pdf';
                  await downloadStudyPdfForOffline(endpoint, fileName);
                }}
                style={{flex:1,backgroundColor:pdfDownloadBusy?'#94A3B8':'#2457D6',paddingVertical:16,paddingHorizontal:6,borderRadius:14,alignItems:'center'}}>
                <Text style={{color:'#FFFFFF',fontSize:14,fontWeight:'900'}}>
                  {pdfDownloadBusy ? '⏳ Downloading...' : '📥 Download Offline'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setPage('Quant Practice')}
              style={{padding:16,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',marginTop:16}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>← Back to Mathematics Topics</Text>
            </TouchableOpacity>
          </View>
        </>}

        {page === 'Quant Questions' && <>
          <View style={{padding:18}}>
            {!quantFinished && <TouchableOpacity
              onPress={() => setPage(/^(Reasoning|English|General Knowledge): /.test(quantTopic) ? 'Subject Topic Folders' : 'Quant Practice')}
              style={{alignSelf:'flex-start',paddingVertical:10,paddingHorizontal:14,marginBottom:12,borderRadius:12,backgroundColor:darkMode?'#17243B':'#E9DEFF',borderWidth:1,borderColor:darkMode?'#2B3D5C':'#D7C8FF'}}>
              <Text style={{fontSize:14,fontWeight:'900',color:darkMode?'#FFFFFF':'#173B83'}}>
                {/^(Reasoning|English|General Knowledge): /.test(quantTopic) ? '← Back to Topics' : '← Back to Mathematics'}
              </Text>
            </TouchableOpacity>}

            <Text style={{fontSize:24,fontWeight:'900',color:'#087F67',marginTop:8}}>
              {quantTopic}
            </Text>
            {quantTopic === 'Number System' && <TouchableOpacity
              onPress={() => startTest('Number System')}
              style={{backgroundColor:'#2457D6',paddingVertical:15,paddingHorizontal:18,borderRadius:12,marginTop:16,alignItems:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>▶ Start Mock Test</Text>
            </TouchableOpacity>}

            {quantFinished ? <>
              <View style={{backgroundColor:'#FFFFFF',borderRadius:16,padding:20,marginTop:18,borderWidth:1,borderColor:'#DCEAE4'}}>
                <Text style={{fontSize:22,fontWeight:'900',color:'#173B35',textAlign:'center'}}>
                  Practice Completed!
                </Text>
                <Text style={{fontSize:38,fontWeight:'900',color:'#087F67',textAlign:'center',marginTop:16}}>
                  {quantQuestions.reduce((n,q,i) => n + (quantAnswers[i] !== undefined && Number(quantAnswers[i]) === Number(q.answer) ? 1 : 0), 0)} / {quantQuestions.length}
                </Text>
                <Text style={{fontSize:14,color:'#718096',textAlign:'center',marginTop:6}}>
                  Correct Answers
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    setQuantQuestion(0);
                    setQuantFinished(false);
                  }}
                  style={{backgroundColor:'#2457D6',padding:14,borderRadius:12,marginTop:12}}>
                  <Text style={{color:'#FFFFFF',fontWeight:'900',textAlign:'center'}}>
                    Review Previous Questions
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setQuantQuestion(0);
                    setQuantAnswers({});
                    setQuantFinished(false);
                    setQuantResultSaved(false);
                  }}
                  style={{backgroundColor:'#087F67',padding:14,borderRadius:12,marginTop:20}}>
                  <Text style={{color:'#FFFFFF',fontWeight:'900',textAlign:'center'}}>
                    {t('Retry Practice','మళ్లీ సాధన చేయండి')}
                  </Text>
                </TouchableOpacity>

              </View>
            </> : quantQuestions[quantQuestion] ? <>
              <View style={{flexDirection:screenWidth >= 760 ? 'row' : 'column',gap:16,alignItems:'stretch'}}>
                <View style={{flex:1,minWidth:0}}>

              <Text style={{fontSize:13,color:'#718096',marginTop:12}}>
                Question {quantQuestion + 1} of {quantQuestions.length}
              </Text>

              <View style={{height:6,backgroundColor:'#DCEAE4',borderRadius:5,marginTop:10,overflow:'hidden'}}>
                <View style={{height:6,backgroundColor:'#087F67',width:(((quantQuestion + 1) / quantQuestions.length) * 100) + '%'}} />
              </View>

              <View style={{backgroundColor:'#FFFFFF',borderRadius:16,padding:18,marginTop:16,borderWidth:1,borderColor:'#DCEAE4'}}>
                <Text style={{fontSize:17,fontWeight:'800',color:'#173B35',lineHeight:25}}>
                  {quantQuestions[quantQuestion].q}
                </Text>

                {quantQuestions[quantQuestion].options.map((opt,i) => {
                  const selected = quantAnswers[quantQuestion] === i;
                  const answered = quantAnswers[quantQuestion] !== undefined;
                  const correct = quantQuestions[quantQuestion].answer === i;
                  return (
                    <TouchableOpacity
                      key={opt}
                      disabled={answered}
                      onPress={() => setQuantAnswers(old => ({...old,[quantQuestion]:i}))}
                      style={{
                        padding:13,
                        marginTop:12,
                        borderRadius:10,
                        borderWidth:1,
                        borderColor:answered && correct ? '#087F67' : selected ? '#D97706' : '#DCEAE4',
                        backgroundColor:answered && correct ? '#E3F4EE' : selected ? '#FFF4DB' : '#FFFFFF'
                      }}>
                      <Text style={{fontSize:14,fontWeight:'700',color:'#173B35'}}>
                        {['A','B','C','D'][i]}. {opt}
                        {answered && correct ? '  ✓' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {quantAnswers[quantQuestion] !== undefined && <>
                  <Text style={{fontSize:15,fontWeight:'900',color:quantAnswers[quantQuestion] === quantQuestions[quantQuestion].answer ? '#087F67' : '#B45309',marginTop:18}}>
                    {quantAnswers[quantQuestion] === quantQuestions[quantQuestion].answer ? 'Correct Answer!' : 'Incorrect Answer'}
                  </Text>
                  <View style={{marginTop:12,padding:14,borderRadius:12,backgroundColor:'#F3F7FC',borderWidth:1,borderColor:'#DCE5F0'}}>
                    <Text style={{fontSize:16,fontWeight:'900',color:'#173B83',marginBottom:10}}>
                      📘 Step-by-Step Explanation
                    </Text>
                    <Text style={{fontSize:14,fontWeight:'800',color:'#2457D6',marginBottom:5}}>
                      Concept / ప్రాథమిక భావన
                    </Text>
                    <Text style={{fontSize:14,color:'#26364A',lineHeight:24}}>
                      {quantQuestions[quantQuestion].explanation.split('\\n')[0]}
                    </Text>
                    {quantQuestions[quantQuestion].explanation.split('\\n').length > 1 && <>
                      <Text style={{fontSize:14,fontWeight:'800',color:'#2457D6',marginTop:12,marginBottom:5}}>
                        Calculation / లెక్కింపు
                      </Text>
                      <Text style={{fontSize:14,color:'#26364A',lineHeight:25}}>
                        {quantQuestions[quantQuestion].explanation.split('\\n').slice(1).join('\\n')}
                      </Text>
                    </>}
                    <View style={{marginTop:12,padding:10,borderRadius:9,backgroundColor:'#E3F4EE'}}>
                      <Text style={{fontSize:13,fontWeight:'800',color:'#087F67'}}>
                        ✓ Correct option: {['A','B','C','D'][quantQuestions[quantQuestion].answer]}. {quantQuestions[quantQuestion].options[quantQuestions[quantQuestion].answer]}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      if (quantQuestion + 1 < quantQuestions.length) {
                        setQuantQuestion(n => n + 1);
                      } else {
                        finishQuantPractice();
                      }
                    }}
                    style={{backgroundColor:'#087F67',padding:14,borderRadius:12,marginTop:18}}>
                    <Text style={{color:'#FFFFFF',fontWeight:'900',textAlign:'center'}}>
                      {quantQuestion + 1 < quantQuestions.length ? t('Next Question →','తదుపరి ప్రశ్న →') : t('View Final Score','తుది స్కోరు చూడండి')}
                    </Text>
                  </TouchableOpacity>
                </>}
              </View>
                </View>
                <View style={{width:screenWidth >= 760 ? 260 : '100%',backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:16,padding:14,borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F0',marginTop:screenWidth >= 760 ? 0 : 16}}>
                  <Text style={{fontSize:18,fontWeight:'900',color:darkMode?'#FFFFFF':'#173B83',marginBottom:8}}>Question Palette</Text>
                  <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-start',gap:8}}>
                    {quantQuestions.map((q,i) => {
                      const answered = quantAnswers[i] !== undefined;
                      const current = quantQuestion === i;
                      return <TouchableOpacity key={i} onPress={() => setQuantQuestion(i)}
                        style={{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:answered?'#079669':(darkMode?'#1E293B':'#FFFFFF'),borderWidth:current?3:1,borderColor:current?'#2563EB':answered?'#079669':(darkMode?'#64748B':'#D5DEE9')}}>
                        <Text style={{fontSize:14,fontWeight:'900',color:answered?'#FFFFFF':(darkMode?'#FFFFFF':'#172B4D')}}>{i+1}</Text>
                      </TouchableOpacity>;
                    })}
                  </View>
                  <View style={{marginTop:14,gap:7}}>
                    <Text style={{fontSize:12,color:darkMode?'#CBD5E1':'#64748B'}}>🟢 Answered   ⚪ Not attempted</Text>
                    <Text style={{fontSize:12,color:darkMode?'#CBD5E1':'#64748B'}}>🔵 Blue border = Current</Text>
                    <Text style={{fontSize:12,fontWeight:'800',color:darkMode?'#FFFFFF':'#173B83'}}>Answered: {Object.keys(quantAnswers).length} / {quantQuestions.length}</Text>
                  </View>
                </View>
              </View>
              <View style={{flexDirection:'row',gap:10,marginTop:18}}>
                <TouchableOpacity disabled={quantQuestion===0} onPress={() => setQuantQuestion(n => Math.max(0,n-1))}
                  style={{flex:1,paddingVertical:14,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:quantQuestion===0?'#CBD5E1':'#FFFFFF',borderWidth:1,borderColor:'#C9D6E5'}}>
                  <Text style={{fontWeight:'900',color:'#173B83'}}>← Previous</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  if (quantQuestion < quantQuestions.length - 1) {
                    setQuantQuestion(quantQuestion + 1);
                  } else {
                    finishQuantPractice();
                  }
                }} style={{flex:2,paddingVertical:14,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#079669'}}>
                  <Text style={{fontWeight:'900',color:'#FFFFFF'}}>{quantQuestion < quantQuestions.length - 1 ? 'Save & Next →' : 'Finish Practice'}</Text>
                </TouchableOpacity>
              </View>
            </> : null}

            <TouchableOpacity
              onPress={() => setPage(/^(Reasoning|English|General Knowledge): /.test(quantTopic) ? 'Subject Topic Folders' : 'Quant Practice')}
              style={{width:'100%',alignSelf:'stretch',paddingVertical:16,paddingHorizontal:12,marginTop:24,marginBottom:12,borderRadius:14,backgroundColor:'#2457D6',alignItems:'center',justifyContent:'center',minHeight:58}}>
              <Text style={{color:'#FFFFFF',fontWeight:'900',fontSize:16}}>
                ← {t('Back to Topics','అంశాలకు తిరిగి వెళ్లండి')}
              </Text>
            </TouchableOpacity>
</View>
        </>}

        {showCancelTestConfirm && <View style={{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:9999,elevation:20,backgroundColor:'rgba(15,23,42,0.72)',alignItems:'center',justifyContent:'center',padding:24}}>
          <View style={{width:'100%',maxWidth:360,backgroundColor:darkMode?'#1E293B':'#FFFFFF',padding:22,borderRadius:18,borderWidth:1,borderColor:darkMode?'#475569':'#DCCBFF'}}>
            <Text style={{fontSize:21,fontWeight:'900',color:darkMode?'#FFFFFF':'#173B83',marginBottom:10}}>Cancel Test?</Text>
            <Text style={{fontSize:15,color:darkMode?'#CBD5E1':'#475569',marginBottom:20}}>Are you sure you want to cancel the test?</Text>
            <View style={{flexDirection:'row',gap:10}}>
              <View style={{flex:1}}>
                {button('No, Continue Test', () => setShowCancelTestConfirm(false))}
              </View>
              <View style={{flex:1}}>
                {button('Cancel Test', () => {
                  setShowCancelTestConfirm(false);
                  setIsTestPaused(false);
                  setAnswers({});
                  setQuestion(0);
                  setScore(null);
                  setTimeLeft(900);
                  setPage('Mock Test Folders');
                  setCancelTestMessage('Your test has been cancelled successfully. You can start a new mock test anytime!');
                }, true)}
              </View>
            </View>
          </View>
        </View>}

        {page === 'Mock Tests' && <>
          <Text style={styles.pageTitle}>{currentSubject}{quantTopic ? ` - ${quantTopic}` : ''} Test</Text>
          {score === null && <View style={{backgroundColor:darkMode?'#17243B':'#E9DEFF',padding:16,borderRadius:14,marginVertical:12,borderWidth:1,borderColor:darkMode?'#475569':'#C4AEFF'}}>
            <Text style={{fontSize:22,fontWeight:'900',textAlign:'center',color:darkMode?'#FFFFFF':'#173B83'}}>
              Time Left: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
            </Text>
            <View style={{flexDirection:'row',gap:10,marginTop:12}}>
              <View style={{flex:1}}>
                {button(isTestPaused ? 'Resume Test' : 'Pause Test', () => setIsTestPaused(p => !p), true)}
              </View>
              <View style={{flex:1}}>
                {button('Cancel Test', () => setShowCancelTestConfirm(true))}
              </View>
            </View>
          </View>}
          {score === null ? <>
            <View style={styles.progressLine}><View style={[styles.progressFill,{width:((question+1)/questions.length*100)+'%'}]} /></View>
            <Text style={[styles.muted,{color:mutedText}]}>Question {question+1} of {questions.length}</Text>

            {['Mathematics','Reasoning','English','General Awareness','General Knowledge'].includes(currentSubject) && <View style={{backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:14,padding:14,marginTop:14,marginBottom:14,borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F0'}}>
              <Text style={{fontSize:17,fontWeight:'900',color:darkMode?'#FFFFFF':'#173B83',marginBottom:10}}>Question Palette</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
                {questions.map((item,i) => {
                  const answered = answers[i] !== undefined;
                  const current = question === i;
                  return <TouchableOpacity key={i} onPress={() => setQuestion(i)}
                    style={{width:42,height:42,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:answered?'#079669':(darkMode?'#1E293B':'#FFFFFF'),borderWidth:current?3:1,borderColor:current?'#2563EB':answered?'#079669':(darkMode?'#64748B':'#D5DEE9')}}>
                    <Text style={{fontSize:14,fontWeight:'900',color:answered?'#FFFFFF':(darkMode?'#FFFFFF':'#172B4D')}}>{i+1}</Text>
                  </TouchableOpacity>;
                })}
              </View>
              <Text style={{fontSize:12,color:mutedText,marginTop:10}}>Green = Answered · Blue border = Current · White = Not attempted</Text>
              <Text style={{fontSize:12,fontWeight:'800',color:darkMode?'#FFFFFF':'#173B83',marginTop:5}}>Answered: {Object.keys(answers).length} / {questions.length}</Text>
            </View>}

            <View style={styles.questionCard}>
              <Text style={styles.questionText}>{questions[question].q}</Text>
              {questions[question].options.map((opt, i) =>
                <TouchableOpacity key={opt}
                  onPress={() => {
                    if (score === null) setAnswers({...answers,[question]:i});
                  }}
                  style={[
                    styles.option,
                    score !== null && i === questions[question].answer && styles.correctOption,
                    score !== null && answers[question] === i && i !== questions[question].answer && styles.wrongOption,
                    score === null && answers[question] === i && styles.optionSelected
                  ]}>
                  <Text style={styles.optionText}>{['A','B','C','D'][i]}.  {opt}</Text>
                </TouchableOpacity>
              )}
            </View>
            {score !== null && (
              <View style={styles.questionCard}>
                <Text style={styles.subjectTitle}>
                  Correct Answer: {questions[question].options[questions[question].answer]}
                </Text>
                <Text style={[styles.muted,{color:mutedText}]}>
                  {questions[question].explanation || 'Review the correct answer above.'}
                </Text>
              </View>
            )}
            <View style={styles.navRow}>
              {button('← Previous', () => setQuestion(Math.max(0,question-1)))}
              {question < questions.length-1
                ? button(['Mathematics','Reasoning','English','General Awareness','General Knowledge'].includes(currentSubject) ? 'Save & Next →' : 'Next →', () => setQuestion(Math.min(questions.length-1,question+1)), true, '#FFFFFF')
                : Object.keys(answers).length === questions.length
                  ? button('Submit Test', submitTest, true)
                  : <Text style={{color:'#D97706',fontWeight:'800',marginTop:12,textAlign:'center'}}>Answer all questions to submit ({Object.keys(answers).length}/{questions.length})</Text>}
            </View>
          </> : <View>
            <View style={{backgroundColor:'#FFFFFF',borderRadius:16,padding:20,marginTop:18,borderWidth:1,borderColor:'#DCEAE4'}}>
              <Text style={{fontSize:22,fontWeight:'900',color:'#173B35',textAlign:'center'}}>
                {['Number System','Reasoning'].includes(currentSubject) ? 'Practice Completed!' : 'Test Completed!'}
              </Text>
              <Text style={{fontSize:38,fontWeight:'900',color:'#087F67',textAlign:'center',marginTop:16}}>
                {score} / {questions.length}
              </Text>
              <Text style={{fontSize:14,color:'#718096',textAlign:'center',marginTop:6}}>Correct Answers</Text>
              <Text style={{fontSize:13,color:'#718096',textAlign:'center',marginTop:8}}>
                Accuracy: {Math.round(score/questions.length*100)}%
              </Text>
              {['Number System','Reasoning'].includes(currentSubject)
                ? <>
                    <TouchableOpacity onPress={() => { setQuestion(0); setScore(null); }} style={{backgroundColor:'#173B83',padding:14,borderRadius:12,marginTop:18}}>
                      <Text style={{color:'#FFFFFF',fontWeight:'800',textAlign:'center'}}>Review Previous Questions</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => startTest(currentSubject, quantTopic)} style={{backgroundColor:'#087F67',padding:14,borderRadius:12,marginTop:10}}>
                      <Text style={{color:'#FFFFFF',fontWeight:'800',textAlign:'center'}}>Retry Practice</Text>
                    </TouchableOpacity>
                  </>
                : <>
                    <Text style={[styles.muted,{color:mutedText}]}>Net Marks: {score * 2 - Object.keys(answers).filter(k => answers[k] !== questions[Number(k)].answer).length * 0.5} / {questions.length * 2}</Text>
                    {button('Try Again', () => startTest(currentSubject, quantTopic), true, '#FFFFFF')}
                    {button('View My Progress', () => setPage('My Progress'))}
                  </>}
            </View>
            <Text style={[styles.sectionTitle,{color:mainText}]}>Answer Review</Text>
            {questions.map((item, qi) => (
              <View key={qi} style={styles.questionCard}>
                <Text style={styles.questionText}>Q{qi+1}. {item.q}</Text>
                {item.options.map((opt, i) => (
                  <View key={i} style={[
                    styles.option,
                    i === item.answer && styles.correctOption,
                    answers[qi] === i && i !== item.answer && styles.wrongOption
                  ]}>
                    <Text style={styles.optionText}>
                      {['A','B','C','D'][i]}. {opt}
                      {i === item.answer ? '  ✓ CORRECT' : ''}
                      {answers[qi] === i && i !== item.answer ? '  ✗ YOUR ANSWER' : ''}
                    </Text>
                  </View>
                ))}
                <Text style={{color:darkMode?'#FFFFFF':'#173B83',fontWeight:'800',marginTop:12}}>Explanation</Text>
                <Text style={[styles.muted,{color:mutedText}]}>{item.explanation || ('Correct answer: ' + item.options[item.answer])}</Text>
              </View>
            ))}
          </View>}
        </>}

        {page === 'My Progress' && <>
          <View style={styles.premiumHeading}>
            <Text style={styles.premiumEyebrow}>YOUR PERFORMANCE</Text>
            <Text style={styles.pageTitle}>My Progress</Text>
            <Text style={styles.premiumSubtitle}>Every test takes you closer to success.</Text>
          </View>

          <View style={{backgroundColor:cardBg,borderRadius:18,padding:16,marginBottom:20,borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F5'}}>
            <Text style={{color:mainText,fontSize:18,fontWeight:'800'}}>📝 All Subjects Mock</Text>
            <Text style={{color:mutedText,marginTop:6,marginBottom:12}}>Mathematics • Reasoning • English • General Knowledge</Text>
            <TouchableOpacity onPress={startAllSubjectsMock} style={{backgroundColor:'#173B83',paddingVertical:14,borderRadius:12,alignItems:'center'}}>
              <Text style={{color:'#FFFFFF',fontWeight:'800'}}>Start All Subjects Mock</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.premiumScoreCard}>
            <Text style={styles.premiumCardLabel}>OVERALL ACCURACY</Text>
            <Text style={styles.premiumBigScore}>
              {(() => { const correct = results.reduce((n,r) => n + Number(r.score || 0), 0); const answered = results.reduce((n,r) => n + Math.max(0, Number(r.total || 0) - Number(r.unanswered || 0)), 0); return answered ? Math.round(correct / answered * 100) : 0; })()}%
            </Text>
            <View style={styles.premiumTrack}>
              <View style={[styles.premiumFill, {width: (() => { const correct = results.reduce((n,r) => n + Number(r.score || 0), 0); const answered = results.reduce((n,r) => n + Math.max(0, Number(r.total || 0) - Number(r.unanswered || 0)), 0); return answered ? Math.round(correct / answered * 100) : 0; })() + '%'}]} />
            </View>
            <Text style={styles.premiumCardFoot}>
              {results.length ? 'Keep practising to improve your score!' : 'Complete your first mock test to see your progress.'}
            </Text>
            <View style={styles.premiumGoldLine} />
          </View>

          <Text style={[styles.sectionTitle,{color:mainText}]}>Performance Overview</Text>
          <View style={styles.premiumStatsRow}>
            <View style={styles.premiumStat}>
              <Text style={styles.premiumStatIcon}>🏆</Text>
              <Text style={styles.premiumStatNum}>{results.reduce((n,r) => n + Math.max(0, Number(r.total || 0) - Number(r.unanswered || 0)), 0)}</Text>
              <Text style={styles.premiumStatLabel}>Questions Answered</Text>
            </View>
            <View style={styles.premiumStat}>
              <Text style={styles.premiumStatIcon}>✓</Text>
              <Text style={styles.premiumStatNum}>{results.reduce((n,r) => n + Number(r.score || 0), 0)}</Text>
              <Text style={styles.premiumStatLabel}>Correct Answers</Text>
            </View>
            <View style={styles.premiumStat}>
              <Text style={styles.premiumStatIcon}>📚</Text>
              <Text style={styles.premiumStatNum}>{(() => { const correct = results.reduce((n,r) => n + Number(r.score || 0), 0); const answered = results.reduce((n,r) => n + Math.max(0, Number(r.total || 0) - Number(r.unanswered || 0)), 0); return answered ? Math.round(correct / answered * 100) : 0; })()}%</Text>
              <Text style={styles.premiumStatLabel}>Accuracy</Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle,{color:mainText}]}>Subject-wise Progress</Text>
          {['Mathematics','Reasoning','English','General Knowledge'].map(subject => {
            const group = results.filter(r => {
              const name = String(r.subject || '');
              return subject === 'Mathematics'
                ? name === 'Mathematics' || name === 'Number System'
                : name === subject || name.startsWith(subject + ':');
            });
            const correct = group.reduce((n,r) => n + Number(r.score || 0), 0);
            const answered = group.reduce((n,r) => n + Math.max(0, Number(r.total || 0) - Number(r.unanswered || 0)), 0);
            const accuracy = answered ? Math.round(correct / answered * 100) : 0;
            return <View key={subject} style={{backgroundColor:cardBg,borderRadius:14,padding:14,marginBottom:10,borderWidth:1,borderColor:'#DCCBFF'}}>
              <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
                <Text style={{fontWeight:'800',color:mainText}}>{subject}</Text>
                <Text style={{fontWeight:'900',color:'#2457D6'}}>{accuracy}%</Text>
              </View>
              <View style={{height:8,backgroundColor:'#E9E4F5',borderRadius:8,overflow:'hidden',marginTop:10}}>
                <View style={{height:8,width:accuracy+'%',backgroundColor:'#7453C8',borderRadius:8}} />
              </View>
              <Text style={{fontSize:12,color:mutedText,marginTop:6}}>{correct} correct · {answered} answered</Text>
            </View>;
          })}

          <Text style={[styles.sectionTitle,{color:mainText,marginTop:12}]}>Topic-wise Progress</Text>
          {results.filter(r => r.topic).length === 0
            ? <Text style={{color:mutedText,marginBottom:16}}>Complete a topic practice to see topic-wise progress here.</Text>
            : results.filter(r => r.topic).map((r,i) => {
                const answered = Math.max(0, Number(r.total || 0) - Number(r.unanswered || 0));
                const accuracy = answered ? Math.round(Number(r.score || 0) / answered * 100) : 0;
                return <View key={String(r.topic)+String(r.date)+i} style={{backgroundColor:cardBg,borderRadius:14,padding:14,marginBottom:10,borderWidth:1,borderColor:'#DCCBFF'}}>
                  <View style={{flexDirection:'row',justifyContent:'space-between',gap:8}}>
                    <View style={{flex:1}}>
                      <Text style={{fontWeight:'800',color:mainText}}>{r.topic}</Text>
                      <Text style={{fontSize:12,color:mutedText,marginTop:4}}>{r.subject} · {answered}/{r.total} answered</Text>
                    </View>
                    <Text style={{fontSize:12,fontWeight:'800',color:'#7453C8'}}>{accuracy}%</Text>
                  </View>
                  <View style={{height:7,backgroundColor:'#E9E4F5',borderRadius:7,overflow:'hidden',marginTop:10}}>
                    <View style={{height:7,width:accuracy+'%',backgroundColor:'#7453C8'}} />
                  </View>
                  <Text style={{fontSize:11,color:mutedText,marginTop:6}}>In Progress · {r.date}</Text>
                </View>;
              })}

          <View style={styles.premiumHistoryHeader}>
            <Text style={[styles.sectionTitle,{color:mainText}]}>Recent Test Results</Text>
            <Text style={styles.premiumHistoryCount}>{results.length} TESTS</Text>
          </View>

          {results.length === 0
            ? <View style={styles.premiumEmpty}>
                <Text style={styles.premiumEmptyIcon}>📈</Text>
                <Text style={styles.premiumEmptyTitle}>Your journey starts here</Text>
                <Text style={styles.premiumSubtitle}>Take a mock test and your results will appear here.</Text>
              </View>
            : results.map((r, i) => <View key={i} style={{backgroundColor:cardBg,borderRadius:14,padding:12,marginBottom:10,borderWidth:1,borderColor:'#DCCBFF'}}>
                <View style={styles.premiumResultRow}>
                  <View style={styles.premiumResultIcon}>
                    <Text style={styles.premiumResultIconText}>{String(results.length-i).padStart(2,'0')}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={styles.subjectTitle}>{r.topic || r.subject}</Text>
                    <Text style={[styles.muted,{color:mutedText}]}>{r.date} · {r.score} correct · {r.incorrect} incorrect · {r.unanswered} unanswered</Text>
                  </View>
                  <View style={styles.premiumResultBadge}>
                    <Text style={styles.premiumResultScore}>{r.score}/{r.total}</Text>
                  </View>
                </View>
                <View style={{flexDirection:'row',gap:10,marginTop:12}}>
                  <TouchableOpacity onPress={() => retryTestResult(r)} style={{flex:1,backgroundColor:'#2457D6',paddingVertical:10,borderRadius:10,alignItems:'center'}}>
                    <Text style={{color:'#FFFFFF',fontWeight:'800'}}>↻ Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteTestResult(i)} style={{flex:1,backgroundColor:'#FDE8E8',paddingVertical:10,borderRadius:10,alignItems:'center',borderWidth:1,borderColor:'#F5B7B7'}}>
                    <Text style={{color:'#B42318',fontWeight:'800'}}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>)}

          <View style={styles.premiumBottomSpace}>
            {button('Start New Mock Test', () => startTest('Mathematics'), true)}
          </View>
        </>}

      </ScrollView>


        {page === 'Notifications' && <>
          <View style={{padding:18}}>
            <TouchableOpacity
              onPress={() => setPage('Courses')}
              style={{alignSelf:'flex-start',paddingVertical:9,paddingHorizontal:13,borderRadius:10,backgroundColor:darkMode?'#26364D':'#E9DEFF'}}
            >
              <Text style={{fontWeight:'800',color:mainText}}>← Back to Home</Text>
            </TouchableOpacity>

            <Text style={[styles.pageTitle,{marginTop:16}]}>Notifications</Text>

            {adminStatusChecked && isNotificationAdmin && (
              <View style={{padding:16,marginTop:16,borderRadius:15,backgroundColor:cardBg,borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F5'}}>
                <Text style={{fontSize:17,fontWeight:'800',color:mainText}}>Admin announcement</Text>
                <TextInput
                  value={announcementTitle}
                  onChangeText={setAnnouncementTitle}
                  placeholder="Notification title (max 80)"
                  placeholderTextColor={mutedText}
                  maxLength={80}
                  style={{marginTop:12,padding:12,borderRadius:10,borderWidth:1,borderColor:darkMode?'#475569':'#CBD5E1',color:mainText}}
                />
                <TextInput
                  value={announcementBody}
                  onChangeText={setAnnouncementBody}
                  placeholder="Message for students (max 300)"
                  placeholderTextColor={mutedText}
                  maxLength={300}
                  multiline
                  style={{marginTop:10,minHeight:90,padding:12,borderRadius:10,borderWidth:1,borderColor:darkMode?'#475569':'#CBD5E1',color:mainText,textAlignVertical:'top'}}
                />
                {!!announcementMessage && (
                  <Text style={{marginTop:10,color:announcementMessage.startsWith('Sent!')?'#16803C':'#D14343'}}>{announcementMessage}</Text>
                )}
                <TouchableOpacity
                  disabled={announcementBusy}
                  onPress={sendAdminAnnouncement}
                  style={{marginTop:12,padding:14,borderRadius:10,alignItems:'center',backgroundColor:announcementBusy?'#64748B':'#173B83'}}
                >
                  <Text style={{fontWeight:'800',color:'#FFFFFF'}}>{announcementBusy?'Sending...':'Send Notification to Students'}</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={[styles.muted,{color:mutedText,marginTop:5}]}>
              {unreadNotifications} unread notification{unreadNotifications === 1 ? '' : 's'}
            </Text>

            {notificationsLoading && (
              <Text style={{color:mutedText,marginTop:18}}>Loading notifications...</Text>
            )}

            {!!notificationsError && (
              <Text style={{color:'#D14343',marginTop:16}}>{notificationsError}</Text>
            )}

            {!notificationsLoading && !notificationsError && notifications.length === 0 && (
              <View style={{padding:24,marginTop:18,borderRadius:16,backgroundColor:cardBg,alignItems:'center'}}>
                <Text style={{fontSize:38}}>🔔</Text>
                <Text style={{fontSize:17,fontWeight:'800',color:mainText,marginTop:10}}>No notifications yet</Text>
                <Text style={{color:mutedText,textAlign:'center',marginTop:6}}>
                  New announcements will appear here.
                </Text>
              </View>
            )}

            {notifications.map(item => (
              <TouchableOpacity
                key={item.id}
                onPress={() => markNotificationRead(item)}
                activeOpacity={0.8}
                style={{padding:16,marginTop:12,borderRadius:15,backgroundColor:cardBg,borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F5'}}
              >
                <View style={{flexDirection:'row',alignItems:'center'}}>
                  <Text style={{fontSize:23,marginRight:10}}>📢</Text>
                  <View style={{flex:1}}>
                    <Text style={{fontSize:16,fontWeight:'800',color:mainText}}>
                      {item.title || 'Study update'}
                    </Text>
                  </View>
                  {!item.readAt && (
                    <View style={{width:9,height:9,borderRadius:5,backgroundColor:'#FF5364'}} />
                  )}
                </View>
                {item.type === 'purchase' && item.studentName ? (
                  <Text style={{color:mutedText,marginTop:9,lineHeight:21}}>
                    <Text style={{fontWeight:'900',color:mainText}}>{item.studentName}</Text>
                    {' purchased '}{item.courseId === 'ssc-reasoning-masterclass' ? 'SSC Reasoning Masterclass' : item.courseId === 'ssc-general-awareness' ? 'SSC General Awareness' : item.courseId === 'ssc-english-foundation' ? 'SSC English Foundation' : item.courseId || 'a course'}{' successfully.'}
                  </Text>
                ) : (
                  <Text style={{color:mutedText,marginTop:9,lineHeight:21}}>
                    {item.body || ''}
                  </Text>
                )}
                {!item.readAt && (
                  <Text style={{fontSize:11,fontWeight:'800',color:'#4777D9',marginTop:10}}>
                    TAP TO MARK AS READ
                  </Text>
                )}
                {item.type === 'purchase' && item.paymentId && !item.studentUid && (
                  <TouchableOpacity
                    onPress={() => downloadInvoice(item)}
                    activeOpacity={0.8}
                    style={{flexDirection:'row',alignItems:'center',justifyContent:'center',paddingVertical:12,paddingHorizontal:14,borderRadius:10,backgroundColor:BLUE,marginTop:12}}
                  >
                    <Feather name="download" size={17} color="#FFFFFF" />
                    <Text style={{fontWeight:'800',color:'#FFFFFF',marginLeft:8}}>Download Invoice PDF</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </>}

        {page === 'Feed' && <>
          <View style={{padding:18}}>
            <Text style={styles.pageTitle}>Feed</Text>
            <Text style={[styles.muted,{color:mutedText}]}>{t('Study updates and exam preparation news.','చదువుకు సంబంధించిన తాజా సమాచారం మరియు పరీక్షల తయారీ వార్తలు.')}</Text>
            {[
              ['📢','Latest Updates',t('Important exam notifications and study announcements will appear here.','ముఖ్యమైన పరీక్షల నోటిఫికేషన్లు మరియు చదువుకు సంబంధించిన ప్రకటనలు ఇక్కడ కనిపిస్తాయి.')],
              ['📰','Current Affairs',t('Daily current affairs content will be added here.','రోజువారీ కరెంట్ అఫైర్స్ సమాచారం ఇక్కడ అందుబాటులో ఉంటుంది.')],
              ['🎯','Exam Preparation Tips',t('Useful tips to help you prepare for competitive exams.','పోటీ పరీక్షలకు సిద్ధం కావడానికి ఉపయోగపడే సూచనలు ఇక్కడ ఉంటాయి.')]
            ].map(([icon,title,desc]) => <View key={title} style={{padding:18,marginTop:14,borderRadius:16,backgroundColor:darkMode?'#1E293B':'#FFFFFF',borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F5'}}>
              <Text style={{fontSize:28}}>{icon}</Text>
              <Text style={{fontSize:17,fontWeight:'800',color:mainText,marginTop:8}}>{title}</Text>
              <Text style={{color:mutedText,marginTop:6}}>{desc}</Text>
            </View>)}
          </View>
        </>}

        {page === 'Live Classes' && <>
          <View style={{padding:18}}>
            <Text style={styles.pageTitle}>Live Classes</Text>
            <Text style={[styles.muted,{color:mutedText}]}>{t('Join live learning sessions and improve your preparation.','లైవ్ క్లాసుల్లో పాల్గొని మీ పరీక్షల తయారీని మెరుగుపరచుకోండి.')}</Text>
            <View style={{padding:22,marginTop:18,borderRadius:18,backgroundColor:darkMode?'#1E293B':'#FFFFFF',borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F5',alignItems:'center'}}>
              <Text style={{fontSize:42}}>📡</Text>
              <Text style={{fontSize:18,fontWeight:'900',color:mainText,marginTop:12}}>Upcoming Live Classes</Text>
              <Text style={{color:mutedText,textAlign:'center',marginTop:8}}>{t('Live class schedules and joining links will be announced here.','లైవ్ క్లాసుల షెడ్యూల్ మరియు చేరడానికి సంబంధించిన లింకులు ఇక్కడ ప్రకటించబడతాయి.')}</Text>
            </View>
          </View>
        </>}

        {page === 'Chat' && <>
          <View style={{padding:16,flex:1}}>
            <Text style={styles.pageTitle}>
              {isNotificationAdmin ? 'Admin Inbox' : 'Student Support Chat'}
            </Text>
            <Text style={{color:mutedText,marginTop:5}}>
              {isNotificationAdmin
                ? 'Student conversations and support replies.'
                : 'Ask the admin for study-related help.'}
            </Text>

            <TouchableOpacity
              onPress={() => {
                loadChatConversations();
                if (isNotificationAdmin && activeChatId) loadChatMessages(activeChatId);
                else if (!isNotificationAdmin && auth.currentUser?.uid) loadChatMessages(auth.currentUser.uid);
              }}
              style={{marginTop:14,alignSelf:'flex-start',backgroundColor:BLUE,paddingVertical:10,paddingHorizontal:16,borderRadius:10}}
            >
              <Text style={{color:'#FFFFFF',fontWeight:'800'}}>↻ Refresh Chat</Text>
            </TouchableOpacity>

            {isNotificationAdmin && (
              <View style={{marginTop:14}}>
                <Text style={{fontWeight:'900',fontSize:16,color:mainText,marginBottom:8}}>
                  Student Conversations ({chatConversations.length})
                </Text>
                {chatConversations.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => {
                      setActiveChatId(item.id);
                      setChatError('');
                      loadChatMessages(item.id);
                    }}
                    style={{
                      padding:12,marginBottom:8,borderRadius:12,
                      backgroundColor:activeChatId===item.id
                        ? (darkMode?'#312E81':'#E9DEFF') : cardBg,
                      borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F5'
                    }}
                  >
                    <Text style={{fontWeight:'900',color:mainText}}>
                      {item.studentName || 'Student'}
                    </Text>
                    <Text style={{fontSize:12,color:mutedText,marginTop:3}}>
                      {item.studentEmail || item.studentUid}
                    </Text>
                    <Text numberOfLines={1} style={{fontSize:13,color:mutedText,marginTop:5}}>
                      {item.lastMessage || 'Start conversation'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {chatLoading && (
              <Text style={{color:mutedText,marginTop:12}}>Loading chat...</Text>
            )}

            {!!chatError && (
              <Text style={{color:'#DC2626',marginTop:10}}>{chatError}</Text>
            )}

            {!!chatNotice && (
              <Text style={{color:'#15803D',marginTop:8}}>{chatNotice}</Text>
            )}

            {(!isNotificationAdmin || !!activeChatId) && (
              <>
                <Text style={{fontWeight:'900',fontSize:16,color:mainText,marginTop:16,marginBottom:8}}>
                  Messages
                </Text>
                <View style={{
                  padding:12,borderRadius:14,minHeight:120,maxHeight:320,
                  backgroundColor:darkMode?'#111827':'#F8FAFF',
                  borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F5'
                }}>
                  {chatMessages.length === 0 && !chatLoading ? (
                    <Text style={{color:mutedText,textAlign:'center',marginTop:24}}>
                      No messages yet. Send a message to start.
                    </Text>
                  ) : chatMessages.map(msg => {
                    const mine = msg.senderUid === auth.currentUser?.uid;
                    return (
                      <View key={msg.id} style={{
                        alignSelf:mine?'flex-end':'flex-start',
                        maxWidth:'88%',padding:10,marginBottom:8,borderRadius:12,
                        backgroundColor:mine?(darkMode?'#3730A3':'#DDE8FF'):cardBg,
                        borderWidth:1,borderColor:darkMode?'#334155':'#E2E8F0'
                      }}>
                        <Text style={{fontSize:11,fontWeight:'800',color:mutedText,marginBottom:4}}>
                          {msg.senderName || 'User'}
                        </Text>
                        <Text style={{color:mainText,lineHeight:20}}>{msg.text}</Text>
                        {!!msg.createdAt && (
                          <Text style={{fontSize:10,color:mutedText,marginTop:4}}>
                            {new Date(msg.createdAt).toLocaleString()}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>

                <TextInput
                  ref={chatInputRef}
                  onPressIn={() => chatInputRef.current?.focus?.()}
                  value={chatDraft}
                  onChangeText={setChatDraft}
                  placeholder="Type your message..."
                  placeholderTextColor={mutedText}
                  multiline={false}
                  maxLength={2000}
                  editable={!chatSending}
                  autoCorrect={true}
                  autoCapitalize="sentences"
                  returnKeyType="send"
                  blurOnSubmit={false}
                  onFocus={() => setChatNotice('')}
                  style={{
                    marginTop:12,minHeight:48,maxHeight:110,
                    borderWidth:1,borderColor:darkMode?'#475569':'#CBD5E1',
                    borderRadius:12,padding:12,color:mainText,
                    backgroundColor:cardBg
                  }}
                />

                <TouchableOpacity
                  disabled={chatSending || !chatDraft.trim() || (isNotificationAdmin && !activeChatId)}
                  onPress={sendChatMessage}
                  style={{
                    marginTop:10,paddingVertical:14,borderRadius:12,
                    alignItems:'center',
                    backgroundColor:(chatSending || !chatDraft.trim() || (isNotificationAdmin && !activeChatId))?'#94A3B8':BLUE
                  }}
                >
                  <Text style={{color:'#FFFFFF',fontWeight:'900'}}>
                    {chatSending?'Sending...':'Send Message'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </>}
        {page === 'Downloads' && <>
          <View style={{padding:18}}>
            <Text style={styles.pageTitle}>Downloads</Text>
            <Text style={[styles.muted,{color:mutedText}]}>
              {t('Your saved PDFs are available here, even when offline.','మీరు సేవ్ చేసిన PDFలు ఇంటర్నెట్ లేకపోయినా ఇక్కడ అందుబాటులో ఉంటాయి.')}
            </Text>

            <View style={{padding:18,marginTop:18,borderRadius:18,backgroundColor:darkMode?'#1E293B':'#FFFFFF',borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F5'}}>
              <Text style={{fontSize:20,fontWeight:'900',color:mainText}}>📥 My Downloaded PDFs</Text>

              {offlinePdfs.length === 0 ? (
                <View style={{alignItems:'center',paddingVertical:24}}>
                  <Text style={{fontSize:42}}>📄</Text>
                  <Text style={{fontSize:15,fontWeight:'800',color:mainText,marginTop:12,textAlign:'center'}}>No PDFs downloaded yet</Text>
                  <Text style={{fontSize:13,color:mutedText,marginTop:8,textAlign:'center',lineHeight:20}}>
                    Open a course topic and tap “Download for Offline” to save its PDF here.
                  </Text>
                </View>
              ) : (
                offlinePdfs.map((item, index) => (
                  <View key={item.uri || item.name || index} style={{marginTop:12,padding:13,borderRadius:12,borderWidth:1,borderColor:darkMode?'#475569':'#DCE5F5',flexDirection:'row',alignItems:'center'}}>
                    <Text style={{fontSize:25,marginRight:10}}>📄</Text>
                    <View style={{flex:1}}>
                      <Text style={{fontSize:13,fontWeight:'800',color:mainText}}>{item.name}</Text>
                      <Text style={{fontSize:11,color:mutedText,marginTop:4}}>Saved on this device</Text>
                    </View>
                    <TouchableOpacity
                      onPress={async () => {
                        try {
                          if (Platform.OS === 'web' && item.uri && item.uri.startsWith('indexeddb:')) {
                            const storageKey = item.uri.slice('indexeddb:'.length);
                            const blob = await new Promise((resolve, reject) => {
                              const request = indexedDB.open('study-with-veer-pdfs', 1);
                              request.onerror = () => reject(request.error || new Error('Browser storage could not open.'));
                              request.onsuccess = () => {
                                const db = request.result;
                                if (!db.objectStoreNames.contains('pdfs')) {
                                  db.close();
                                  resolve(null);
                                  return;
                                }
                                const tx = db.transaction('pdfs', 'readonly');
                                const getRequest = tx.objectStore('pdfs').get(storageKey);
                                getRequest.onsuccess = () => { const value = getRequest.result; db.close(); resolve(value || null); };
                                getRequest.onerror = () => { db.close(); reject(getRequest.error || new Error('Saved PDF could not be read.')); };
                              };
                            });
                            if (!blob) {
                              Alert.alert('PDF not found', 'Please download this PDF again.');
                              return;
                            }
                            const objectUrl = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = objectUrl;
                            link.target = '_blank';
                            link.rel = 'noopener';
                            link.click();
                            setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
                            return;
                          }
                          const info = await FileSystem.getInfoAsync(item.uri);
                          if (!info.exists) {
                            Alert.alert('File not found','This PDF is no longer available on this device. Please download it again.');
                            return;
                          }
                          const available = await Sharing.isAvailableAsync();
                          if (available) {
                            await Sharing.shareAsync(item.uri, {
                              mimeType:'application/pdf',
                              dialogTitle:'Open downloaded PDF'
                            });
                          } else {
                            await Linking.openURL(item.uri);
                          }
                        } catch (error) {
                          Alert.alert('Could not open PDF',error.message || 'Please try again.');
                        }
                      }}
                      style={{backgroundColor:'#2457D6',paddingVertical:9,paddingHorizontal:12,borderRadius:10,marginLeft:8}}
                    >
                      <Text style={{color:'#FFFFFF',fontSize:12,fontWeight:'900'}}>Open</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        const removePdf = async () => {
                          try {
                            if (Platform.OS === 'web' && item.uri && item.uri.startsWith('indexeddb:')) {
                              const storageKey = item.uri.slice('indexeddb:'.length);
                              await new Promise((resolve, reject) => {
                                const request = indexedDB.open('study-with-veer-pdfs', 1);
                                request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
                                request.onsuccess = () => {
                                  const db = request.result;
                                  if (!db.objectStoreNames.contains('pdfs')) {
                                    db.close();
                                    resolve();
                                    return;
                                  }
                                  const tx = db.transaction('pdfs', 'readwrite');
                                  tx.objectStore('pdfs').delete(storageKey);
                                  tx.oncomplete = () => { db.close(); resolve(); };
                                  tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not delete PDF.')); };
                                };
                              });
                            } else if (item.uri) {
                              const info = await FileSystem.getInfoAsync(item.uri);
                              if (info.exists) await FileSystem.deleteAsync(item.uri, { idempotent: true });
                            }

                            const uid = auth.currentUser && auth.currentUser.uid;
                            if (uid) {
                              const key = 'veer_offline_pdfs_' + uid;
                              const saved = await AsyncStorage.getItem(key);
                              const list = saved ? JSON.parse(saved) : [];
                              await AsyncStorage.setItem(key, JSON.stringify(
                                list.filter(pdf => pdf.uri !== item.uri && pdf.name !== item.name)
                              ));
                            }
                            setOfflinePdfs(prev => prev.filter(pdf => pdf.uri !== item.uri && pdf.name !== item.name));
                            Alert.alert('Deleted', 'The downloaded PDF was removed from this device.');
                          } catch (error) {
                            Alert.alert('Delete failed', error.message || 'Please try again.');
                          }
                        };

                        if (Platform.OS === 'web') {
                          if (window.confirm('Delete this downloaded PDF from this device?')) await removePdf();
                        } else {
                          Alert.alert('Delete PDF?', 'Remove this downloaded PDF from this device?', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: removePdf }
                          ]);
                        }
                      }}
                      style={{backgroundColor:'#DC2626',paddingVertical:9,paddingHorizontal:10,borderRadius:10,marginLeft:8}}
                    >
                      <Text style={{color:'#FFFFFF',fontSize:12,fontWeight:'900'}}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </View>
        </>}


      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {navItems.map(([name, iconName, iconColor]) => {
          const active = page === name || (name === 'My Courses' && page === 'Courses');
          return (
            <TouchableOpacity
              key={name}
              onPress={() => setPage(name === 'Feed' ? 'Current Affairs' : name === 'My Courses' ? 'Courses' : name)}
              activeOpacity={0.75}
              style={[styles.navItem, active && { backgroundColor: '#F3EEFF', borderRadius: 14 }]}
            >
              <Feather name={iconName} size={23} color={active ? '#2457D6' : iconColor} />
              <Text style={[styles.navLabel, active && styles.activeNav]}>
                {t(name, ({Home:'హోమ్','My Courses':'నా కోర్సులు','Live Classes':'లైవ్ తరగతులు',Downloads:'డౌన్‌లోడ్స్'})[name] || name)}
              </Text>
              {active && <View style={{width:18,height:3,borderRadius:2,backgroundColor:'#2457D6',marginTop:3}} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {purchasePopupName ? (
        <View style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(15,23,42,0.62)',justifyContent:'center',alignItems:'center',padding:24,zIndex:9999,elevation:9999}}>
          <View style={{width:'100%',maxWidth:360,backgroundColor:darkMode?'#172337':'#FFFFFF',borderRadius:24,padding:24,alignItems:'center',borderWidth:1,borderColor:darkMode?'#334155':'#E2D6FF',elevation:12}}>
            <View style={{width:72,height:72,borderRadius:22,backgroundColor:darkMode?'#312E81':'#F3EEFF',alignItems:'center',justifyContent:'center',marginBottom:16}}>
              <Text style={{fontSize:34}}>🔒</Text>
            </View>
            <Text style={{fontSize:11,fontWeight:'900',letterSpacing:1.5,color:'#7952C7'}}>STUDY WITH VEER</Text>
            <Text style={{fontSize:22,fontWeight:'900',color:mainText,textAlign:'center',marginTop:10}}>Course Purchase Required</Text>
            <Text style={{fontSize:15,color:mutedText,textAlign:'center',lineHeight:22,marginTop:10}}>Please purchase course first, {purchasePopupName}.</Text>
            <TouchableOpacity onPress={() => setPurchasePopupName('')} activeOpacity={0.85} style={{marginTop:22,width:'100%',backgroundColor:'#173B83',paddingVertical:14,borderRadius:14,alignItems:'center'}}>
              <Text style={{color:'#FFFFFF',fontSize:15,fontWeight:'900'}}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
</View>
  );
}

const styles = StyleSheet.create({
  premiumHeading: {marginHorizontal:18, marginTop:22, marginBottom:8},
  premiumEyebrow: {fontSize:10, fontWeight:'900', letterSpacing:2, color:'#B18A36'},
  premiumSubtitle: {fontSize:12, color:'#77839A', marginTop:5, lineHeight:18},
  premiumScoreCard: {backgroundColor:'#173B83', marginHorizontal:16, marginTop:12, borderRadius:22, padding:22, overflow:'hidden', elevation:4},
  premiumCardLabel: {fontSize:10, fontWeight:'900', letterSpacing:1.8, color:'#D7E3FF'},
  premiumBigScore: {fontSize:48, fontWeight:'900', color:'#FFFFFF', marginTop:10},
  premiumTrack: {height:8, backgroundColor:'#4967A1', borderRadius:8, overflow:'hidden', marginTop:8},
  premiumFill: {height:8, backgroundColor:'#F0C96B', borderRadius:8},
  premiumCardFoot: {fontSize:11, color:'#E1E9FF', marginTop:12, lineHeight:17},
  premiumGoldLine: {height:3, width:56, backgroundColor:'#F0C96B', borderRadius:3, marginTop:18},
  premiumStatsRow: {flexDirection:'row', marginHorizontal:12, marginTop:4},
  premiumStat: {flex:1, backgroundColor:'#FFFFFF', borderRadius:16, paddingVertical:16, paddingHorizontal:5, marginHorizontal:4, alignItems:'center', borderWidth:1, borderColor:'#E7ECF5', elevation:2},
  premiumStatIcon: {fontSize:19, color:'#B18A36', marginBottom:7},
  premiumStatNum: {fontSize:22, fontWeight:'900', color:'#173B83'},
  premiumStatLabel: {fontSize:10, color:'#77839A', marginTop:5, fontWeight:'700'},
  premiumHistoryHeader: {flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginRight:18},
  premiumHistoryCount: {fontSize:9, fontWeight:'900', color:'#B18A36', letterSpacing:1},
  premiumEmpty: {backgroundColor:'#FFFFFF', marginHorizontal:16, marginTop:6, borderRadius:18, padding:24, alignItems:'center', borderWidth:1, borderColor:'#E7ECF5'},
  premiumEmptyIcon: {fontSize:34, marginBottom:8},
  premiumEmptyTitle: {fontSize:16, fontWeight:'900', color:'#172B55', marginTop:4},
  premiumResultRow: {backgroundColor:'#FFFFFF', marginHorizontal:16, marginTop:10, padding:14, borderRadius:15, flexDirection:'row', alignItems:'center', borderWidth:1, borderColor:'#E7ECF5', elevation:1},
  premiumResultIcon: {width:40, height:40, borderRadius:12, backgroundColor:'#EAF0FF', alignItems:'center', justifyContent:'center', marginRight:12},
  premiumResultIconText: {fontSize:13, fontWeight:'900', color:'#173B83'},
  premiumResultBadge: {backgroundColor:'#FFF5D9', paddingHorizontal:12, paddingVertical:8, borderRadius:10, marginLeft:8},
  premiumResultScore: {fontSize:15, fontWeight:'900', color:'#8B6821'},
  premiumBottomSpace: {marginHorizontal:16, marginBottom:24},

  app: {flex:1, backgroundColor:BG},
  loginPage: {flex:1, backgroundColor:BLUE, justifyContent:'center', padding:24},
  logo: {fontSize:48, textAlign:'center'},
  brand: {fontSize:27, fontWeight:'900', color:'#35245C', textAlign:'center', marginTop:8},
  tagline: {color:'#D8E4FF', textAlign:'center', marginTop:6, marginBottom:28},
  loginCard: {backgroundColor:'#FFFFFF', borderRadius:22, padding:22},
  heading: {fontSize:25, fontWeight:'800', color:'#172B55'},
  muted: {fontSize:12, color:'#77839A', marginTop:5},
  input: {height:50, borderWidth:1, borderColor:'#DCE3F0', borderRadius:11, paddingHorizontal:14, marginTop:16, color:'#172B55'},
  button: {borderWidth:1, borderColor:'#D7E0F0', borderRadius:11, paddingVertical:13, paddingHorizontal:14, alignItems:'center', marginTop:14},
  primaryButton: {backgroundColor:BLUE, borderColor:BLUE},
  buttonText: {color:BLUE, fontWeight:'700', fontSize:13},
  primaryText: {color:'#FFFFFF'},
  note: {fontSize:11, color:'#77839A', textAlign:'center', marginTop:14},
  header: {backgroundColor:BLUE, paddingHorizontal:20, paddingTop:22, paddingBottom:22, minHeight:88, flexDirection:'row', alignItems:'center', justifyContent:'space-between'},
  headerSmall: {color:'#CFDDFF', fontSize:12, letterSpacing:1.5},
  headerTitle: {color:'#35245C', fontSize:22, fontWeight:'900', marginTop:5},
  headerIcon: {fontSize:28},
  content: {flex:1},
  hero: {backgroundColor:BLUE, margin:16, borderRadius:20, padding:20},
  heroSmall: {color:'#C8D9FF', fontSize:10, letterSpacing:1.5, fontWeight:'700'},
  heroTitle: {color:'#35245C', fontSize:27, fontWeight:'900', marginTop:12, lineHeight:34},
  heroDesc: {color:'#E0E9FF', fontSize:13, marginTop:8},
  sectionTitle: {fontSize:17, fontWeight:'800', color:'#172B55', marginHorizontal:16, marginTop:18, marginBottom:10},
  statsRow: {flexDirection:'row', marginHorizontal:12, marginTop:8},
  stat: {flex:1, backgroundColor:'#FFFFFF', borderRadius:14, padding:14, marginHorizontal:4, alignItems:'center', elevation:1},
  statNum: {fontSize:22, fontWeight:'900', color:BLUE},
  subject: {flexDirection:'row', alignItems:'center', backgroundColor:'#FFFFFF', marginHorizontal:16, marginTop:9, borderRadius:14, padding:14, elevation:1},
  subjectEmoji: {fontSize:26, marginRight:12},
  subjectTitle: {fontSize:14, fontWeight:'800', color:'#172B55'},
  arrow: {fontSize:25, color:BLUE, marginLeft:8},
  pageTitle: {fontSize:25, fontWeight:'900', color:'#172B55', marginHorizontal:16, marginTop:20},
  subjectCard: {backgroundColor:'#FFFFFF', marginHorizontal:16, marginTop:14, borderRadius:16, padding:17, elevation:1},
  progressLine: {height:7, backgroundColor:'#DCE5F7', borderRadius:6, marginHorizontal:16, marginTop:18, overflow:'hidden'},
  progressFill: {height:7, backgroundColor:BLUE, borderRadius:6},
  questionCard: {backgroundColor:'#FFFFFF', borderRadius:18, padding:18, margin:16, elevation:1},
  questionText: {fontSize:20, fontWeight:'800', color:'#172B55', marginBottom:16},
  option: {borderWidth:1, borderColor:'#DCE3F0', borderRadius:11, padding:14, marginTop:9},
  optionSelected: {backgroundColor:'#E6EEFF', borderColor:BLUE},
  correctOption: {backgroundColor:'#D9FBE5', borderColor:'#159447', borderWidth:2},
  wrongOption: {backgroundColor:'#FFE0E0', borderColor:'#D92D20', borderWidth:2},
  optionText: {color:'#172B55', fontSize:14},
  navRow: {flexDirection:'row', justifyContent:'space-around', paddingHorizontal:10},
  resultEmoji: {fontSize:42, textAlign:'center'},
  resultTitle: {fontSize:23, fontWeight:'900', color:BLUE, textAlign:'center', marginTop:8},
  score: {fontSize:34, fontWeight:'900', color:BLUE, textAlign:'center', marginTop:10},
  progressCard: {backgroundColor:'#FFFFFF', borderRadius:16, marginHorizontal:16, marginTop:16, padding:18, elevation:1},
  empty: {margin:18, color:'#77839A', textAlign:'center', lineHeight:20},
  resultRow: {backgroundColor:'#FFFFFF', marginHorizontal:16, marginTop:9, padding:15, borderRadius:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between'},
  resultScore: {fontSize:18, fontWeight:'900', color:BLUE},
  bottomNav: {backgroundColor:'#FFFFFF', flexDirection:'row', justifyContent:'space-around', paddingTop:8, paddingBottom:18, borderTopWidth:1, borderColor:'#E1E7F1'},
  navItem: {alignItems:'center', flex:1},
  navSymbol: {fontSize:21, color:'#8A95A9'},
  navLabel: {fontSize:10, color:'#8A95A9', marginTop:3},
  activeNav: {color:BLUE, fontWeight:'900'},
});
