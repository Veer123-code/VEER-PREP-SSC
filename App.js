import React, {useState, useEffect, useRef} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  View, Text, ScrollView, TouchableOpacity, Image, Animated, Platform, useWindowDimensions,
  TextInput, StyleSheet, StatusBar, Linking
} from 'react-native';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
  , signOut
} from 'firebase/auth';
import { auth } from './firebase';
import { Feather } from '@expo/vector-icons';

const BLUE = '#173B83';
const BG = '#F3F6FC';

export default function App() {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const loadingSpin = useRef(new Animated.Value(0)).current;
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
  const [unlockedCourses, setUnlockedCourses] = useState({});
  const [authLoading, setAuthLoading] = useState(true);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const pageBg = darkMode ? '#0B1220' : '#F1F5FB';
  const cardBg = darkMode ? '#172337' : '#FFFFFF';
  const mainText = darkMode ? '#F1F5F9' : '#102A56';
  const mutedText = darkMode ? '#B0BDD0' : '#64748B';
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

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

  const emailLetterAnims = useRef('Email'.split('').map(() => new Animated.Value(0))).current;
  const passwordLetterAnims = useRef('Password'.split('').map(() => new Animated.Value(0))).current;

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
  const [page, setPage] = useState('Courses');
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
    require('./assets/slideshow/slide1.png'),
    require('./assets/slideshow/slide2.png'),
    require('./assets/slideshow/slide3.jpg'),
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
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(null);
  const [results, setResults] = useState([]);
  const [quantTopic, setQuantTopic] = useState('');
  const [quantQuestion, setQuantQuestion] = useState(0);
  const [quantAnswers, setQuantAnswers] = useState({});
  const [quantFinished, setQuantFinished] = useState(false);


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
      if (user) setPage("Courses");
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

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
        const response = await fetch('https://study-with-veer-payment-backend.onrender.com/my-courses', {
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
    const loadResults = async () => {
      try {
        const saved = await AsyncStorage.getItem('veer_prep_results');
        if (saved) setResults(JSON.parse(saved));
      } catch (error) {
        console.log('Could not load saved results:', error);
      }
    };
    loadResults();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('veer_prep_results', JSON.stringify(results))
      .catch(error => console.log('Could not save results:', error));
  }, [results]);

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
  const questions = questionBank[currentSubject] || questionBank['Mathematics'];
  const quantTopics = [
    'Number System','Simplification','Percentage','Ratio & Proportion',
    'Average','Profit & Loss','Discount','Simple Interest',
    'Compound Interest','Time & Work','Pipes & Cisterns',
    'Time, Speed & Distance','Algebra','Geometry','Mensuration',
    'Trigonometry','Statistics','Data Interpretation'
  ];

  const quantBank = {
    'Percentage': [
      {q:'25% of 240 = ?',options:['40','50','60','80'],answer:2,explanation:'240 × 25/100 = 60.'},
      {q:'40% of 350 = ?',options:['120','130','140','150'],answer:2,explanation:'350 × 40/100 = 140.'},
      {q:'A number increases from 80 to 100. Percentage increase?',options:['20%','25%','30%','40%'],answer:1,explanation:'Increase = 20. Percentage = 20/80 × 100 = 25%.'},
      {q:'15% of 600 = ?',options:['60','75','90','120'],answer:2,explanation:'600 × 15/100 = 90.'},
      {q:'A student scores 360 out of 450. Percentage?',options:['70%','75%','80%','85%'],answer:2,explanation:'360/450 × 100 = 80%.'},
      {q:'20% of a number is 50. Find the number.',options:['200','225','250','275'],answer:2,explanation:'Number = 50 × 100/20 = 250.'},
      {q:'A price of ₹500 is reduced by 10%. New price?',options:['₹400','₹450','₹475','₹490'],answer:1,explanation:'Discount = ₹50; new price = ₹450.'},
      {q:'What percentage of 80 is 20?',options:['20%','25%','30%','40%'],answer:1,explanation:'20/80 × 100 = 25%.'},
      {q:'Population 2000 increases by 5%. New population?',options:['2050','2100','2150','2200'],answer:1,explanation:'5% of 2000 = 100; total = 2100.'},
      {q:'A number decreases from 120 to 90. Percentage decrease?',options:['20%','25%','30%','35%'],answer:1,explanation:'Decrease = 30; 30/120 × 100 = 25%.'}
    ]
  };
  const quantQuestions = quantBank[quantTopic] || [];


  const subjects = [
    ['Mathematics', 'Numbers, arithmetic and algebra', '📐'],
    ['Reasoning', 'Logic, series and puzzles', '🧠'],
    ['English', 'Grammar and vocabulary', '📖'],
    ['General Knowledge', 'History, geography and science', '🌍'],
  ];

  const startTest = (subject = 'Mathematics') => {
    setCurrentSubject(subject);
    setQuestion(0);
    setAnswers({});
    setScore(null);
    setTimeLeft(900);
    setPage('Mock Tests');
  };

  const submitTest = () => {
    const result = questions.reduce(
      (total, item, i) => total + (answers[i] === item.answer ? 1 : 0), 0
    );
    const incorrect = Object.keys(answers).filter(
      k => answers[k] !== questions[Number(k)].answer
    ).length;
    const testResult = {
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
    if (page !== 'Mock Tests' || score !== null) return;
    if (timeLeft <= 0) {
      submitTest();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [page, score, timeLeft]);

  const button = (label, action, primary = false) => (
    <TouchableOpacity onPress={action}
      style={[styles.button, primary && styles.primaryButton]}>
      <Text style={[styles.buttonText, primary && styles.primaryText]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const handleAuth = async () => {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setAuthError('Please enter your email and password.');
      return;
    }

    setAuthBusy(true);
    setAuthError('');

    try {
      if (isCreatingAccount) {
        await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await signOut(auth);
        setIsCreatingAccount(false);
        setPassword('');
        setAuthError('Account created successfully. Please log in.');
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
            source={require('./assets/slideshow/slide2.png')}
            style={{width:200,height:200,borderRadius:100,resizeMode:'cover'}}
          />
        </View>
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

          <View style={{backgroundColor:cardBg, borderRadius:22, padding:22, borderWidth:1, borderColor:darkMode ? '#334155' : '#E5EAF4'}}>
            <Text style={{fontSize:25, fontWeight:'800', color:mainText}}>
              {isCreatingAccount ? t('Create Account', 'ఖాతా సృష్టించండి') : t('Welcome Back!', 'తిరిగి స్వాగతం!')}
            </Text>
            <Text style={{fontSize:13, color:'#64748B', marginTop:7, marginBottom:23}}>
              {isCreatingAccount ? t('Create your account and start preparing', 'మీ ఖాతాను సృష్టించి సిద్ధం కావడం ప్రారంభించండి') : t('Login to continue your preparation', 'మీ ప్రిపరేషన్ కొనసాగించడానికి లాగిన్ అవ్వండి')}
            </Text>


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
            {!!authError && (
              <Text style={{color:'#C62828', fontSize:12, marginBottom:12}}>
                {authError}
              </Text>
            )}

            <TouchableOpacity
              nativeID="veer-login-space" className="veer-space-btn"
              onPress={handleAuth}
              disabled={authBusy}
              style={{backgroundColor:'#173B83',paddingVertical:15,borderRadius:50,alignItems:'center',justifyContent:'center',marginTop:8,minHeight:54,position:'relative',overflow:'hidden'}}
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
              style={{backgroundColor:'#173B83',marginTop:16,paddingVertical:12,borderRadius:50,alignItems:'center',justifyContent:'center',minHeight:50,position:'relative',overflow:'hidden'}}
            >
              <View className="veer-space-content" style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9}}>
                <Text className="veer-space-text" style={{color:'#FFFFFF',fontWeight:'800',fontSize:12,letterSpacing:2}}>
                  {isCreatingAccount ? t('BACK TO LOGIN', 'లాగిన్‌కు తిరిగి') : t('CREATE ACCOUNT', 'ఖాతా సృష్టించండి')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

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

  const navItems = [     ['Home', '⌂'],     ['My Courses', '🎓'],     ['Live Classes', '📡'],     ['Downloads', '📥']
  ];

  return (
    <View style={[styles.app, {backgroundColor:pageBg}]}>
      <StatusBar barStyle="light-content" backgroundColor={BLUE} />

      <View style={{backgroundColor:'#08152F',paddingTop:12,paddingHorizontal:14,paddingBottom:14,borderBottomWidth:1,borderBottomColor:'#244579'}}>
        <View style={{flexDirection:'row',alignItems:'center',minHeight:54}}>
          <TouchableOpacity
            onPress={() => setMenuOpen(v => !v)}
            activeOpacity={0.75}
            style={{width:46,height:46,alignItems:'center',justifyContent:'center',borderRadius:15,backgroundColor:'#13284B',borderWidth:0,borderColor:'transparent',marginRight:11}}
          >
            <Text style={{fontSize:25,color:'#FFFFFF',fontWeight:'700'}}>{menuOpen ? '✕' : '☰'}</Text>
          </TouchableOpacity>

          <View style={{flex:1}}>
            <Text style={{fontSize:10,fontWeight:'900',color:'#70A7FF',letterSpacing:1.5}}>{t('WELCOME TO', 'స్వాగతం')}</Text>
            <Text style={{fontSize:16,fontWeight:'900',color:'#FFFFFF',letterSpacing:0.3}}>STUDY WITH VEER</Text>
            <Text style={{fontSize:10,color:'#C5D4EE',marginTop:2}}>{t('Prepare  •  Practice  •  Succeed', 'సిద్ధం అవ్వండి  •  సాధన చేయండి  •  విజయం సాధించండి')}</Text>
          </View>

          <TouchableOpacity
            onPress={() => alert('Search will be available soon.')}
            activeOpacity={0.75}
            style={{width:42,height:42,alignItems:'center',justifyContent:'center',borderRadius:14,backgroundColor:'#142A50',borderWidth:0,borderColor:'transparent',marginRight:8}}
          >
            <Text style={{fontSize:25,color:'#FFFFFF'}}>⌕</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => alert('No new notifications.')}
            activeOpacity={0.75}
            style={{width:42,height:42,alignItems:'center',justifyContent:'center',borderRadius:14,backgroundColor:'#142A50',borderWidth:0,borderColor:'transparent'}}
          >
            <Text style={{fontSize:20,color:'#FFD77A'}}>♧</Text>
            <View style={{position:'absolute',top:5,right:5,width:8,height:8,borderRadius:4,backgroundColor:'#FF5364',borderWidth:0,borderColor:'transparent'}} />
          </TouchableOpacity>
        </View>

        <View style={{flexDirection:'row',backgroundColor:'#101F3D',borderRadius:17,padding:5,marginTop:14,borderWidth:1,borderColor:'#29446E'}}>
          <TouchableOpacity
            onPress={() => setPage('Courses')}
            activeOpacity={0.8}
            style={{flex:1,flexDirection:'row',paddingVertical:12,alignItems:'center',justifyContent:'center',backgroundColor:page==='Courses'?'#2563EB':'transparent',borderRadius:12,borderWidth:page==='Courses'?1:0,borderColor:'#75A7FF'}}
          >
            <Text style={{fontSize:15,marginRight:7}}>▣</Text>
            <Text style={{color:'#FFFFFF',fontWeight:'800',fontSize:13}}>{t('VEER Classes', 'వీర్ తరగతులు')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPage('Mock Test Folders')}
            activeOpacity={0.8}
            style={{flex:1,flexDirection:'row',paddingVertical:12,alignItems:'center',justifyContent:'center',backgroundColor:page==='Mock Test Folders'?'#2563EB':'transparent',borderRadius:12,borderWidth:page==='Mock Test Folders'?1:0,borderColor:'#75A7FF'}}
          >
            <Text style={{fontSize:15,marginRight:7}}>◈</Text>
            <Text style={{color:'#FFFFFF',fontWeight:'800',fontSize:13}}>{t('VEER Tests', 'వీర్ పరీక్షలు')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {menuOpen && (
        <View style={{
          backgroundColor:darkMode?'#06142D':'#FFFFFF',
          marginHorizontal:12,marginTop:10,marginBottom:8,
          borderRadius:22,padding:14,
          borderWidth:1.5,borderColor:darkMode?'#237BFF':'#B9D2FF',
          elevation:9,shadowColor:'#1677FF',shadowOpacity:0.22,
          shadowRadius:12,shadowOffset:{width:0,height:5}
        }}>
          <View style={{flexDirection:'row',alignItems:'center',marginBottom:15}}>
            <View style={{
              width:58,height:58,borderRadius:29,
              backgroundColor:darkMode?'#102C59':'#E8F1FF',
              borderWidth:2,borderColor:'#2785FF',
              alignItems:'center',justifyContent:'center',marginRight:12
            }}>
              <Text style={{fontSize:29,fontWeight:'900',color:'#4DA2FF'}}>V</Text>
              <Text style={{position:'absolute',top:1,right:4,fontSize:12}}>🎓</Text>
            </View>
            <View style={{flex:1}}>
              <Text style={{fontSize:10,fontWeight:'900',color:'#3995FF',letterSpacing:1.4}}>{t('WELCOME TO', 'స్వాగతం')}</Text>
              <Text style={{fontSize:17,fontWeight:'900',color:darkMode?'#FFFFFF':'#10264A'}}>STUDY WITH VEER</Text>
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
                color:'#25BFFF',marginBottom:8,marginLeft:4
              }}>{section.title}</Text>
              {section.items.map(([name,symbol]) => {
                const destination = ['Mock Tests','Previous Year Papers'].includes(name)
                  ? 'Mock Test Folders'
                  : ['My Purchases','Paid Courses','Free Courses'].includes(name)
                    ? 'Courses' : name;
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
                        ? (darkMode?'#124BB5':'#E5EFFF')
                        : 'transparent',
                      borderWidth:active?1.2:1,
                      borderColor:active?'#278BFF':'transparent'
                    }}>
                    <View style={{
                      width:35,height:35,borderRadius:11,
                      alignItems:'center',justifyContent:'center',
                      backgroundColor:active
                        ? (darkMode?'#1768E8':'#C9DEFF')
                        : (darkMode?'#18345C':'#E4EDFA'),
                      borderWidth:1,
                      borderColor:'transparent',
                      marginRight:11
                    }}>
                      <Text style={{
                        fontSize:18,
                        color: name==='Paid Courses'?'#D9A52E':
                          (darkMode?'#FFFFFF':'#163D78')
                      }}>{symbol}</Text>
                    </View>
                    <Text style={{
                      flex:1,fontSize:14,fontWeight:active?'900':'700',
                      color:active?(darkMode?'#FFFFFF':'#12366B'):(darkMode?'#E4EDFF':'#183153')
                    }}>{t(name, ({Home:'హోమ్','My Courses':'నా కోర్సులు','Live Classes':'లైవ్ తరగతులు',Downloads:'డౌన్‌లోడ్స్'})[name] || name)}</Text>
                    <View style={{
                      width:30,height:30,borderRadius:10,
                      alignItems:'center',justifyContent:'center',
                      backgroundColor:active
                        ? (darkMode?'#2879F5':'#D1E3FF')
                        : (darkMode?'#102441':'#F0F5FC'),
                      borderWidth:1,
                      borderColor:'transparent'
                    }}>
                      <Text style={{
                        fontSize:21,fontWeight:'900',
                        color:active?(darkMode?'#FFFFFF':'#16458A'):(darkMode?'#C5DCFF':'#315784')
                      }}>→</Text>
                    </View>
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
              <TouchableOpacity onPress={() => changeLanguage('en')} style={{flex:1,alignItems:'center',paddingVertical:10,borderRadius:10,backgroundColor:language==='en'?'#173B83':'transparent',borderWidth:1,borderColor:language==='en'?'#278BFF':'#94A3B8'}}>
                <Text style={{fontSize:13,fontWeight:'800',color:language==='en'?'#FFFFFF':(darkMode?'#E4EDFF':'#183153')}}>English</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => changeLanguage('te')} style={{flex:1,alignItems:'center',paddingVertical:10,borderRadius:10,backgroundColor:language==='te'?'#173B83':'transparent',borderWidth:1,borderColor:language==='te'?'#278BFF':'#94A3B8'}}>
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
              minHeight:54,
              paddingHorizontal:15,
              paddingVertical:13,
              borderRadius:15,
              backgroundColor:darkMode?'#3A1728':'#FFF0F2',
              borderWidth:1.5,
              borderColor:darkMode?'#E34D72':'#F2A1B0',
              elevation:3,
              marginTop:3
            }}>
            <View style={{
              width:36,height:36,borderRadius:11,
              backgroundColor:darkMode?'#67233A':'#FFDDE3',
              alignItems:'center',justifyContent:'center',
              marginRight:12
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

      <ScrollView style={[styles.content, {backgroundColor:pageBg}]} contentContainerStyle={{paddingBottom:24}}>
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

  <View style={styles.hero}>
    <Text style={styles.heroSmall}>{t('YOUR GOAL, YOUR FUTURE','మీ లక్ష్యం, మీ భవిష్యత్తు')}</Text>
    <Text style={[styles.heroTitle,{fontSize:17,fontStyle:'italic',fontWeight:'500',lineHeight:25,marginTop:12,textAlign:'center'}]}>{t('Thank you for choosing this app','ఈ యాప్‌ను ఎంచుకున్నందుకు ధన్యవాదాలు')}</Text>
    <Text style={[styles.heroTitle,{fontSize:25,fontStyle:'italic',fontWeight:'900',marginTop:8,textAlign:'center'}]}>STUDY WITH VEER</Text>
    <Text style={styles.heroDesc}>{typedTagline}<Text style={{color:"#FBBF24"}}>{typedTagline.length < 39 ? "▍" : ""}</Text></Text>
    {button(t('START MOCK TEST  →','మాక్ టెస్ట్ ప్రారంభించండి  →'), startTest, true)}
  </View>
  <Text style={[styles.sectionTitle,{color:mainText}]}>{t('Your Study Overview','మీ చదువు వివరాలు')}</Text>
  <View style={styles.statsRow}>
    <View style={[styles.stat,{backgroundColor:cardBg,borderWidth:1,borderColor:darkMode?"#334155":"#E5EAF4"}]}><Text style={styles.statNum}>4</Text><Text style={[styles.muted,{color:mutedText}]}>{t('Subjects','విషయాలు')}</Text></View>
    <View style={[styles.stat,{backgroundColor:cardBg,borderWidth:1,borderColor:darkMode?"#334155":"#E5EAF4"}]}><Text style={styles.statNum}>{results.length}</Text><Text style={[styles.muted,{color:mutedText}]}>{t('Tests Taken','రాసిన పరీక్షలు')}</Text></View>
    <View style={[styles.stat,{backgroundColor:cardBg,borderWidth:1,borderColor:darkMode?"#334155":"#E5EAF4"}]}><Text style={styles.statNum}>{results.length ? Math.round(results.reduce((a,b)=>a+b,0)/(results.length*questions.length)*100) : 0}%</Text><Text style={[styles.muted,{color:mutedText}]}>{t('Accuracy','ఖచ్చితత్వం')}</Text></View>
  </View>
  <Text style={[styles.sectionTitle,{color:mainText}]}>{t('Explore STUDY WITH VEER','STUDY WITH VEER ను అన్వేషించండి')}</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',paddingHorizontal:16}}>
    {[
      ['My Purchases','🛍️','Courses'],
      ['Paid Courses','🎓','Courses'],
      ['Current Affairs','📰','Subjects'],
      ['Previous Year Papers','📚','Mock Test Folders'],
      ['Mock Tests','📝','Mock Test Folders'],
      ['My Progress','📊','My Progress'],
      ['Free Courses','📖','Courses']
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
        <Text style={{fontSize:28,marginBottom:8}}>{icon}</Text>
        <Text style={{fontSize:14,fontWeight:'800',color:darkMode?'#BFDBFE':'#173B83'}}>{t(title,({'My Purchases':'నా కొనుగోళ్లు','Paid Courses':'పెయిడ్ కోర్సులు','Current Affairs':'కరెంట్ అఫైర్స్','Previous Year Papers':'గత సంవత్సరాల ప్రశ్నపత్రాలు','Mock Tests':'మాక్ టెస్టులు','My Progress':'నా ప్రగతి','Free Courses':'ఉచిత కోర్సులు'})[title] || title)}</Text>
        <Text style={{fontSize:12,color:mutedText,marginTop:5}}>{t('Explore  ›','చూడండి  ›')}</Text>
      </TouchableOpacity>
    ))}
  </View>
</>}

{page === 'Mock Test Folders' && <>
          <View style={{padding:18}}>
            <Text style={styles.pageTitle}>{t('Mock Test Folders','మాక్ టెస్ట్ విభాగాలు')}</Text>
            <Text style={[styles.muted,{color:mutedText}]}>{t('Choose a subject to start your practice test.','ప్రాక్టీస్ టెస్ట్ ప్రారంభించడానికి ఒక విషయాన్ని ఎంచుకోండి.')}</Text>
            {[
              ['Mathematics','📐','Arithmetic, Percentage, Algebra'],
              ['Reasoning','🧠','Series, Analogy, Coding-Decoding'],
              ['English','📖','Grammar, Vocabulary, Spelling'],
              ['General Knowledge','🌍','History, Geography, Polity, Science']
            ].map(([subject, icon, description]) => (
              <TouchableOpacity
                key={subject}
                onPress={() => startTest(subject)}
                style={[styles.subjectCard,{marginTop:14,backgroundColor:darkMode?'#1E293B':'#FFFFFF',borderRadius:18,padding:18,borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F5'}]}>
                <Text style={{fontSize:32,marginBottom:8}}>{icon}</Text>
                <Text style={[styles.subjectTitle,{color:darkMode?'#FFFFFF':'#173B83'}]}>{t(subject + ' Mock Tests', subject==='Mathematics'?'గణిత మాక్ టెస్టులు':subject==='Reasoning'?'రీజనింగ్ మాక్ టెస్టులు':subject==='English'?'ఇంగ్లీష్ మాక్ టెస్టులు':'జనరల్ నాలెడ్జ్ మాక్ టెస్టులు')}</Text>
                <Text style={[styles.muted,{color:mutedText}]}>{description}</Text>
                <View style={{marginTop:12,backgroundColor:'#173B83',padding:11,borderRadius:10}}>
                  <Text style={{color:'#FFFFFF',fontWeight:'800',textAlign:'center'}}>{t('Start Test →','పరీక్ష ప్రారంభించండి →')}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
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

        {(page === 'Courses' || page === 'SSC Courses' || page === 'TGPSC Courses' || page === 'RRB Courses') && <>
          <View style={{padding:18}}>
            <TouchableOpacity
              onPress={() => setPage(page === 'Courses' ? 'Home' : 'Courses')}
              style={{paddingVertical:8}}>
              <Text style={{color:darkMode?'#6EE7B7':'#087F67',fontWeight:'800'}}>
                ← {page === 'Courses' ? t('Back to Home','హోమ్‌కు తిరిగి వెళ్లండి') : t('All Exam Categories','అన్ని పరీక్షల విభాగాలు')}
              </Text>
            </TouchableOpacity>

            <Text style={{fontSize:25,fontWeight:'900',color:'#087F67',marginTop:8}}>
              {page === 'Courses' ? t('Choose Your Exam','మీ పరీక్షను ఎంచుకోండి') : page === 'SSC Courses' ? t('SSC Exams','SSC పరీక్షలు') : page === 'TGPSC Courses' ? t('TGPSC Exams','TGPSC పరీక్షలు') : t('RRB Exams','RRB పరీక్షలు')}
            </Text>
            <Text style={{fontSize:13,color:'#718096',marginTop:6}}>
              {t('STUDY WITH VEER • Prepare Smart. Achieve More.','STUDY WITH VEER • తెలివిగా సిద్ధం అవ్వండి. మరింత సాధించండి.')}
            </Text>

            {page === 'Courses' && [
              {title:'SSC Exams',desc:'CGL, CHSL, MTS, GD and CPO',icon:'📘',target:'SSC Courses'},
              {title:'TGPSC Exams',desc:'Group 1, Group 2, Group 3 and Group 4',icon:'🏛️',target:'TGPSC Courses'},
              {title:'RRB Exams',desc:'NTPC, Group D, ALP and Technician',icon:'🚆',target:'RRB Courses'}
            ].map(exam => (
              <TouchableOpacity key={exam.title}
                onPress={() => setPage(exam.target)}
                style={{backgroundColor:'#FFFFFF',borderRadius:16,padding:18,marginTop:14,borderWidth:1,borderColor:'#DCEAE4',flexDirection:'row',alignItems:'center'}}>
                <Text style={{fontSize:30,marginRight:14}}>{exam.icon}</Text>
                <View style={{flex:1}}>
                  <Text style={{fontSize:17,fontWeight:'900',color:'#173B35'}}>{exam.title}</Text>
                  <Text style={{fontSize:13,color:'#718096',marginTop:5}}>{t(exam.desc, ({'CGL, CHSL, MTS, GD and CPO':'CGL, CHSL, MTS, GD మరియు CPO','Group 1, Group 2, Group 3 and Group 4':'గ్రూప్ 1, గ్రూప్ 2, గ్రూప్ 3 మరియు గ్రూప్ 4','NTPC, Group D, ALP and Technician':'NTPC, గ్రూప్ D, ALP మరియు టెక్నీషియన్'})[exam.desc] || exam.desc)}</Text>
                </View>
                <Text style={{fontSize:22,color:'#087F67'}}>›</Text>
              </TouchableOpacity>
            ))}

            {page === 'SSC Courses' && <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>{[
              {title:'SSC Mathematics',desc:'Arithmetic, algebra and topic-wise practice',price:'FREE',icon:'🧮',accent:'#8B5CF6',tint:'#F0EAFE'},
              {id:'ssc-reasoning-masterclass',title:'SSC Reasoning Masterclass',desc:'Verbal and non-verbal reasoning',price:'₹49',icon:'🧠',accent:'#2563EB',tint:'#E8F0FF'},
              {id:'ssc-general-awareness',title:'SSC General Awareness',desc:'History, geography, polity and science',price:'₹49',icon:'🌍',accent:'#059669',tint:'#DDF8EE'},
              {title:'SSC English Foundation',desc:'Grammar and vocabulary',price:'FREE',icon:'📚',accent:'#D97706',tint:'#FFF0D8'}
            ].map(course => (
              <View key={course.title} style={{width:'48.2%',backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:18,padding:screenWidth < 360 ? 7 : 11,marginTop:14,borderWidth:1,borderColor:darkMode?'#2B3D5C':'#E0E7F2',elevation:3}}>
                <View style={{height:76,borderRadius:13,backgroundColor:darkMode?course.accent+'33':course.tint,alignItems:'center',justifyContent:'center',marginBottom:10}}>
    <Text style={{fontSize:34}}>{course.icon}</Text>
    <View style={{position:'absolute',top:5,right:5,backgroundColor:course.price==='FREE'?'#0D9668':'#D9A323',paddingHorizontal:6,paddingVertical:4,borderRadius:6}}>
      <Text style={{fontSize:9,fontWeight:'900',color:'#FFFFFF'}}>{course.price==='FREE'?'FREE':'PREMIUM'}</Text>
    </View>
  </View>
  <Text style={{fontSize:14,fontWeight:'900',lineHeight:19,minHeight:38,color:darkMode?'#F3F6FC':'#17233B'}}>{course.title}</Text>
                <Text style={{fontSize:11,lineHeight:16,minHeight:48,color:darkMode?'#B4C1D6':'#68758B',marginTop:5}}>{t(course.desc, ({'Arithmetic, algebra and topic-wise practice':'అంకగణితం, బీజగణితం మరియు అంశాల వారీగా సాధన','Verbal and non-verbal reasoning':'వెర్బల్ మరియు నాన్-వెర్బల్ రీజనింగ్','History, geography, polity and science':'చరిత్ర, భూగోళశాస్త్రం, రాజ్యాంగం మరియు సైన్స్','Grammar and vocabulary':'వ్యాకరణం మరియు పదజాలం'})[course.desc] || course.desc)}</Text>
                <Text style={{fontSize:16,fontWeight:'900',marginTop:7,color:course.price==='FREE'?'#10B981':(darkMode?'#F6C453':'#B77908')}}>{course.price}</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (course.price !== 'FREE' && (unlockedCourses[course.id])) {
                      alert('This paid course bundle is already purchased.');
                      return;
                    }

                    if (course.title === 'SSC Mathematics') {
                      setPage('Quant Practice');
                    } else if (course.title === 'SSC English Foundation') {
                      alert('English Foundation lessons will be available here soon.');
                    } else {
                      if (Platform.OS !== 'web') {
                    Linking.openURL("https://study-with-veer-payment-backend.onrender.com/checkout.html").catch(() => alert("Could not open test checkout. Please try again."));
                    else {
                      (async () => {
                        try {
                          if (!window.Razorpay) {
                            await new Promise((resolve, reject) => {
                              const script = document.createElement('script');
                              script.src = 'https:' + '/' + '/checkout.razorpay.com/v1/checkout.js';
                              script.onload = resolve;
                              script.onerror = reject;
                              document.body.appendChild(script);
                            });
                          }

                          const user = auth.currentUser;
                          if (!user) throw new Error('Please log in before purchasing.');
                          const idToken = await user.getIdToken();

                          const response = await fetch('https://study-with-veer-payment-backend.onrender.com/create-order', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': 'Bearer ' + idToken
                            },
                            body: JSON.stringify({ courseId: course.id })
                          });

                          const order = await response.json();
                          if (!response.ok) throw new Error(order.error || 'Could not create order');

                          const options = {
                            key: order.keyId,
                            amount: order.amount,
                            currency: order.currency,
                            name: 'STUDY WITH VEER',
                            description: course.title,
                            order_id: order.orderId,
                            theme: { color: '#087F67' },
                            handler: async function (payment) {
                              try {
                                const verification = await fetch('https://study-with-veer-payment-backend.onrender.com/verify-payment', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': 'Bearer ' + idToken
                                  },
                                  body: JSON.stringify(payment)
                                });
                                const result = await verification.json();

                                if (!verification.ok || !result.verified || !result.unlocked) {
                                  alert(result.error || 'Payment verification failed. Course access was not unlocked.');
                                  return;
                                }

                                const currentUser = auth.currentUser;
                                if (currentUser) {
                                  const freshToken = await currentUser.getIdToken();
                                  const accessResponse = await fetch('https://study-with-veer-payment-backend.onrender.com/my-courses', {
                                    headers: { Authorization: 'Bearer ' + freshToken }
                                  });
                                  const accessData = await accessResponse.json();

                                  if (accessResponse.ok) {
                                    setUnlockedCourses(accessData.courses || {});
                                  }
                                }

                                alert('Payment verified. Course access has been saved.');
                              } catch (error) {
                                alert('Could not verify payment. Please contact support.');
                              }
                            }
                          };

                          new window.Razorpay(options).open();
                        } catch (error) {
                          alert(error.message || 'Could not open Razorpay checkout.');
                        }
                      })();
                    }
                    }
                  }}
                  style={{backgroundColor:course.price==='FREE'?'#0D9668':(darkMode?'#2563EB':'#2457D6'),paddingVertical:11,paddingHorizontal:4,borderRadius:10,alignItems:'center',marginTop:10,minHeight:40,justifyContent:'center'}}>
                  <Text style={{color:'#FFFFFF',fontWeight:'800'}}>
                    {course.price === 'FREE' ? t('Start Learning →','నేర్చుకోవడం ప్రారంభించండి →') : unlockedCourses[course.id] ? t('Continue Learning →','నేర్చుకోవడం కొనసాగించండి →') : t('Buy for ₹49 →','₹49కి కొనండి →')}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}</View>}

            {page === 'TGPSC Courses' && <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
            {[
              {title:'Group 1',icon:'🏛️',accent:'#2563EB',tint:'#E8F0FF'},
              {title:'Group 2',icon:'📚',accent:'#7C3AED',tint:'#F0EAFE'},
              {title:'Group 3',icon:'🎯',accent:'#059669',tint:'#DDF8EE'},
              {title:'Group 4',icon:'🏆',accent:'#D97706',tint:'#FFF0D8'}
            ].map(exam => (
              <View key={exam.title} style={{width:'48.2%',backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:18,padding:screenWidth < 360 ? 7 : 11,marginTop:14,borderWidth:1,borderColor:darkMode?'#2B3D5C':'#E0E7F2',elevation:3}}>
                <View style={{height:76,borderRadius:13,backgroundColor:darkMode?exam.accent+'33':exam.tint,alignItems:'center',justifyContent:'center',marginBottom:10}}>
                  <Text style={{fontSize:34}}>{exam.icon}</Text>
                  <View style={{position:'absolute',top:5,right:5,backgroundColor:'#D9A323',paddingHorizontal:6,paddingVertical:4,borderRadius:6}}>
                    <Text style={{fontSize:9,fontWeight:'900',color:'#FFFFFF'}}>PREMIUM</Text>
                  </View>
                </View>
                <Text style={{fontSize:15,fontWeight:'900',color:darkMode?'#F3F6FC':'#17233B',minHeight:38}}>{exam.title}</Text>
                <Text style={{fontSize:11,lineHeight:16,minHeight:48,color:darkMode?'#B4C1D6':'#68758B',marginTop:5}}>{t('Telangana history, polity, economy and general studies','తెలంగాణ చరిత్ర, రాజ్యాంగం, ఆర్థిక వ్యవస్థ మరియు జనరల్ స్టడీస్')}</Text>
                <Text style={{fontSize:16,fontWeight:'900',color:darkMode?'#F6C453':'#B77908',marginTop:7}}>₹49</Text>
                <TouchableOpacity onPress={() => alert(exam.title + ' course content will be added next.')} style={{backgroundColor:darkMode?'#2563EB':'#2457D6',paddingVertical:11,paddingHorizontal:4,borderRadius:10,alignItems:'center',marginTop:10,minHeight:40,justifyContent:'center'}}>
                  <Text style={{color:'#FFFFFF',fontSize:12,fontWeight:'800',textAlign:'center'}}>{t('Explore Course →','కోర్సును చూడండి →')}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>}

          {page === 'RRB Courses' && <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>
            {[
              {title:'RRB NTPC',icon:'🚆',accent:'#2563EB',tint:'#E8F0FF'},
              {title:'RRB Group D',icon:'🚉',accent:'#7C3AED',tint:'#F0EAFE'},
              {title:'RRB ALP',icon:'🚄',accent:'#059669',tint:'#DDF8EE'},
              {title:'RRB Technician',icon:'⚙️',accent:'#D97706',tint:'#FFF0D8'}
            ].map(exam => (
              <View key={exam.title} style={{width:'48.2%',backgroundColor:darkMode?'#17243B':'#FFFFFF',borderRadius:18,padding:screenWidth < 360 ? 7 : 11,marginTop:14,borderWidth:1,borderColor:darkMode?'#2B3D5C':'#E0E7F2',elevation:3}}>
                <View style={{height:76,borderRadius:13,backgroundColor:darkMode?exam.accent+'33':exam.tint,alignItems:'center',justifyContent:'center',marginBottom:10}}>
                  <Text style={{fontSize:34}}>{exam.icon}</Text>
                  <View style={{position:'absolute',top:5,right:5,backgroundColor:'#D9A323',paddingHorizontal:6,paddingVertical:4,borderRadius:6}}>
                    <Text style={{fontSize:9,fontWeight:'900',color:'#FFFFFF'}}>PREMIUM</Text>
                  </View>
                </View>
                <Text style={{fontSize:15,fontWeight:'900',color:darkMode?'#F3F6FC':'#17233B',minHeight:38}}>{exam.title}</Text>
                <Text style={{fontSize:11,lineHeight:16,minHeight:48,color:darkMode?'#B4C1D6':'#68758B',marginTop:5}}>{t('Mathematics, reasoning, general science and awareness','గణితం, రీజనింగ్, జనరల్ సైన్స్ మరియు జనరల్ అవేర్‌నెస్')}</Text>
                <Text style={{fontSize:16,fontWeight:'900',color:darkMode?'#F6C453':'#B77908',marginTop:7}}>₹49</Text>
                <TouchableOpacity onPress={() => alert(exam.title + ' course content will be added next.')} style={{backgroundColor:darkMode?'#2563EB':'#2457D6',paddingVertical:11,paddingHorizontal:4,borderRadius:10,alignItems:'center',marginTop:10,minHeight:40,justifyContent:'center'}}>
                  <Text style={{color:'#FFFFFF',fontSize:12,fontWeight:'800',textAlign:'center'}}>Explore Course →</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>}          </View>
        </>}

        {page === 'Quant Practice' && <>
          <View style={{padding:18}}>
            <TouchableOpacity onPress={() => setPage('Courses')}
              style={{paddingVertical:8}}>
              <Text style={{color:darkMode?'#6EE7B7':'#087F67',fontWeight:'800'}}>{t('← Back to Courses','← కోర్సులకు తిరిగి వెళ్లండి')}</Text>
            </TouchableOpacity>
            <Text style={{fontSize:25,fontWeight:'900',color:'#087F67',marginTop:8}}>
              SSC Mathematics
            </Text>
            <Text style={{fontSize:13,color:'#718096',marginTop:6}}>
              Quantitative Aptitude • Topic-wise Practice
            </Text>
            {[
              'Number System','Simplification','Percentage',
              'Ratio & Proportion','Average','Profit & Loss',
              'Discount','Simple Interest','Compound Interest',
              'Time & Work','Pipes & Cisterns','Time, Speed & Distance',
              'Algebra','Geometry','Mensuration','Trigonometry',
              'Statistics','Data Interpretation'
            ].map((topic, index) => (
              <TouchableOpacity key={topic}
                onPress={() => {
                  if (quantBank[topic] && quantBank[topic].length > 0) {
                    setQuantTopic(topic);
                    setQuantQuestion(0);
                    setQuantAnswers({});
                    setQuantFinished(false);
                    setPage('Quant Questions');
                  } else {
                    alert(topic + ': Questions will be added soon.');
                  }
                }}
                style={{backgroundColor:'#FFFFFF',borderRadius:13,padding:15,
                  marginTop:10,borderWidth:1,borderColor:'#DCEAE4',
                  flexDirection:'row',alignItems:'center'}}>
                <View style={{width:36,height:36,borderRadius:10,
                  backgroundColor:'#E3F4EE',alignItems:'center',
                  justifyContent:'center',marginRight:12}}>
                  <Text style={{color:darkMode?'#6EE7B7':'#087F67',fontWeight:'900'}}>{index+1}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={{fontSize:15,fontWeight:'800',color:'#173B35'}}>
                    {topic}
                  </Text>
                  <Text style={{fontSize:12,color:'#718096',marginTop:4}}>
                    10 MCQs • Answers & explanations
                  </Text>
                </View>
                <Text style={{color:darkMode?'#6EE7B7':'#087F67',fontSize:20}}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>}

        {page === 'Quant Questions' && <>
          <View style={{padding:18}}>
            <TouchableOpacity
              onPress={() => setPage('Quant Practice')}
              style={{paddingVertical:10}}>
              <Text style={{color:darkMode?'#6EE7B7':'#087F67',fontWeight:'800'}}>
                ← {t('Back to Topics','అంశాలకు తిరిగి వెళ్లండి')}
              </Text>
            </TouchableOpacity>

            <Text style={{fontSize:24,fontWeight:'900',color:'#087F67',marginTop:8}}>
              {quantTopic}
            </Text>

            {quantFinished ? <>
              <View style={{backgroundColor:'#FFFFFF',borderRadius:16,padding:20,marginTop:18,borderWidth:1,borderColor:'#DCEAE4'}}>
                <Text style={{fontSize:22,fontWeight:'900',color:'#173B35',textAlign:'center'}}>
                  Practice Completed!
                </Text>
                <Text style={{fontSize:38,fontWeight:'900',color:'#087F67',textAlign:'center',marginTop:16}}>
                  {quantQuestions.reduce((n,q,i) => n + (quantAnswers[i] === q.answer ? 1 : 0), 0)} / {quantQuestions.length}
                </Text>
                <Text style={{fontSize:14,color:'#718096',textAlign:'center',marginTop:6}}>
                  Correct Answers
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setQuantQuestion(0);
                    setQuantAnswers({});
                    setQuantFinished(false);
                  }}
                  style={{backgroundColor:'#087F67',padding:14,borderRadius:12,marginTop:20}}>
                  <Text style={{color:'#FFFFFF',fontWeight:'900',textAlign:'center'}}>
                    {t('Retry Practice','మళ్లీ సాధన చేయండి')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPage('Quant Practice')}
                  style={{padding:14,marginTop:6}}>
                  <Text style={{color:darkMode?'#6EE7B7':'#087F67',fontWeight:'800',textAlign:'center'}}>
                    Back to Topics
                  </Text>
                </TouchableOpacity>
              </View>
            </> : quantQuestions[quantQuestion] ? <>
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
                  <Text style={{fontSize:14,color:'#425466',lineHeight:22,marginTop:6}}>
                    {quantQuestions[quantQuestion].explanation}
                  </Text>

                  <TouchableOpacity
                    onPress={() => {
                      if (quantQuestion + 1 < quantQuestions.length) {
                        setQuantQuestion(n => n + 1);
                      } else {
                        setQuantFinished(true);
                      }
                    }}
                    style={{backgroundColor:'#087F67',padding:14,borderRadius:12,marginTop:18}}>
                    <Text style={{color:'#FFFFFF',fontWeight:'900',textAlign:'center'}}>
                      {quantQuestion + 1 < quantQuestions.length ? t('Next Question →','తదుపరి ప్రశ్న →') : t('View Final Score','తుది స్కోరు చూడండి')}
                    </Text>
                  </TouchableOpacity>
                </>}
              </View>
            </> : null}
          </View>
        </>}

        {page === 'Mock Tests' && <>
          <Text style={styles.pageTitle}>{currentSubject} Test</Text>
          {score === null && <Text style={styles.subjectTitle}>Time Left: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}</Text>}
          {score === null ? <>
            <View style={styles.progressLine}><View style={[styles.progressFill,{width:((question+1)/questions.length*100)+'%'}]} /></View>
            <Text style={[styles.muted,{color:mutedText}]}>Question {question+1} of {questions.length}</Text>
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
                ? button('Next →', () => setQuestion(Math.min(questions.length-1,question+1)), true)
                : button('Submit Test', submitTest, true)}
            </View>
          </> : <View>
            <View style={styles.questionCard}>
              <Text style={styles.resultEmoji}>🏆</Text>
              <Text style={styles.resultTitle}>Test Completed!</Text>
              <Text style={styles.score}>{score} / {questions.length}</Text>
              <Text style={[styles.muted,{color:mutedText}]}>Accuracy: {Math.round(score/questions.length*100)}%</Text>
              <Text style={styles.subjectTitle}>Net Marks: {score * 2 - Object.keys(answers).filter(k => answers[k] !== questions[Number(k)].answer).length * 0.5} / {questions.length * 2}</Text>
              <Text style={[styles.muted,{color:mutedText}]}>Correct: {score}  |  Incorrect: {Object.keys(answers).filter(k => answers[k] !== questions[Number(k)].answer).length}  |  Unanswered: {questions.length-Object.keys(answers).length}</Text>
              {button('Try Again', startTest, true)}
              {button('View My Progress', () => setPage('My Progress'))}
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

          <View style={styles.premiumScoreCard}>
            <Text style={styles.premiumCardLabel}>OVERALL ACCURACY</Text>
            <Text style={styles.premiumBigScore}>
              {results.length ? Math.round(results.reduce((a, r) => a + r.score, 0) / results.reduce((a, r) => a + r.total, 0) * 100) : 0}%
            </Text>
            <View style={styles.premiumTrack}>
              <View style={[styles.premiumFill, {width: (results.length ? Math.round(results.reduce((a, r) => a + r.score, 0) / results.reduce((a, r) => a + r.total, 0) * 100) : 0) + '%'}]} />
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
              <Text style={styles.premiumStatNum}>{results.length}</Text>
              <Text style={styles.premiumStatLabel}>Tests Done</Text>
            </View>
            <View style={styles.premiumStat}>
              <Text style={styles.premiumStatIcon}>✓</Text>
              <Text style={styles.premiumStatNum}>{results.reduce((a, r) => a + r.score, 0)}</Text>
              <Text style={styles.premiumStatLabel}>Correct</Text>
            </View>
            <View style={styles.premiumStat}>
              <Text style={styles.premiumStatIcon}>📚</Text>
              <Text style={styles.premiumStatNum}>{results.reduce((a, r) => a + r.total, 0)}</Text>
              <Text style={styles.premiumStatLabel}>Questions</Text>
            </View>
          </View>

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
            : results.map((r, i) => <View key={i} style={styles.premiumResultRow}>
                <View style={styles.premiumResultIcon}>
                  <Text style={styles.premiumResultIconText}>{String(results.length-i).padStart(2,'0')}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={styles.subjectTitle}>{r.subject}</Text>
                  <Text style={[styles.muted,{color:mutedText}]}>{r.date} · {r.score} correct · {r.incorrect} incorrect · {r.unanswered} unanswered</Text>
                </View>
                <View style={styles.premiumResultBadge}>
                  <Text style={styles.premiumResultScore}>{r.score}/{r.total}</Text>
                </View>
              </View>)}

          <View style={styles.premiumBottomSpace}>
            {button('Start New Mock Test', startTest, true)}
          </View>
        </>}

      </ScrollView>


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

        {page === 'Downloads' && <>
          <View style={{padding:18}}>
            <Text style={styles.pageTitle}>Downloads</Text>
            <Text style={[styles.muted,{color:mutedText}]}>{t('Access your study materials and PDF question papers.','మీ స్టడీ మెటీరియల్స్ మరియు PDF ప్రశ్నపత్రాలను ఇక్కడ చూడవచ్చు.')}</Text>
            <View style={{padding:22,marginTop:18,borderRadius:18,backgroundColor:darkMode?'#1E293B':'#FFFFFF',borderWidth:1,borderColor:darkMode?'#334155':'#DCE5F5',alignItems:'center'}}>
              <Text style={{fontSize:42}}>📥</Text>
              <Text style={{fontSize:18,fontWeight:'900',color:mainText,marginTop:12}}>Study Materials</Text>
              <Text style={{color:mutedText,textAlign:'center',marginTop:8}}>{t('Downloaded files and available PDF materials will appear here when download support is added.','డౌన్‌లోడ్ సదుపాయం అందుబాటులోకి వచ్చిన తర్వాత డౌన్‌లోడ్ చేసిన ఫైళ్లు మరియు PDF మెటీరియల్స్ ఇక్కడ కనిపిస్తాయి.')}</Text>
            </View>
          </View>
        </>}

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {navItems.map(([name, symbol]) => <TouchableOpacity key={name}
          onPress={() => setPage(name === 'Feed' ? 'Current Affairs' : name === 'My Courses' ? 'Courses' : name)} style={styles.navItem}>
          <Text style={[styles.navSymbol, page===name && styles.activeNav]}>{symbol}</Text>
          <Text style={[styles.navLabel, page===name && styles.activeNav]}>{t(name, ({Home:'హోమ్','My Courses':'నా కోర్సులు','Live Classes':'లైవ్ తరగతులు',Downloads:'డౌన్‌లోడ్స్'})[name] || name)}</Text>
        </TouchableOpacity>)}
      </View>
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
  brand: {fontSize:27, fontWeight:'900', color:'#FFFFFF', textAlign:'center', marginTop:8},
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
  headerTitle: {color:'#FFFFFF', fontSize:22, fontWeight:'900', marginTop:5},
  headerIcon: {fontSize:28},
  content: {flex:1},
  hero: {backgroundColor:BLUE, margin:16, borderRadius:20, padding:20},
  heroSmall: {color:'#C8D9FF', fontSize:10, letterSpacing:1.5, fontWeight:'700'},
  heroTitle: {color:'#FFFFFF', fontSize:27, fontWeight:'900', marginTop:12, lineHeight:34},
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
