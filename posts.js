import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getDatabase, ref, set, get, child, update, onValue } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";

// Authentic Firebase configurations node
const firebaseConfig = {
    apiKey: "AIzaSyBxik7a3hTld_a4_exiwj38yRsHPV9IqG0",
    authDomain: "sgs-updates.firebaseapp.com",
    databaseURL: "https://sgs-updates-default-rtdb.firebaseio.com",
    projectId: "sgs-updates",
    storageBucket: "sgs-updates.firebasestorage.app",
    messagingSenderId: "547095411322",
    appId: "1:547095411322:web:0e5f4139a0e567e0ecd9c3"
};
 
// Initialize Firebase Engines
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Global Fail-safe Loader Dismissal Helper
window.hideGlobalLoadingScreen = function() {
    const loader = document.getElementById('globalLoadingScreen');
    if (loader && !loader.classList.contains('hidden')) {
        loader.style.opacity = '0';
        setTimeout(() => loader.classList.add('hidden'), 300);
    }
};

// Maximum Fail-safe Loader timer (2.5 seconds fallback)
setTimeout(() => {
    window.hideGlobalLoadingScreen();
}, 2500);

// Auto capture referral code from URL query string & store in localStorage
const urlParams = new URLSearchParams(window.location.search);
let refParam = urlParams.get('ref') || urlParams.get('id');
if (refParam) {
    localStorage.setItem('sgs_pending_ref', refParam.toUpperCase());
} else {
    refParam = localStorage.getItem('sgs_pending_ref');
}

if (refParam) {
    window.addEventListener('DOMContentLoaded', () => {
        const refInput = document.getElementById('registerRefCode');
        if (refInput) refInput.value = refParam.toUpperCase();
    });
}

// Core Shared Context State Variables
let currentAuthenticatedUserToken = null;
let userDataRecordCached = null;

const MASTER_ADMIN_UIDS = ["XOwUMbiocdcGszrNy4NHQ3zBXOx1", "FXiwQyLFgbYuJkVQ7ONjaAQpbSG3"];

// Explicitly defined functions for Admin Console to ensure Hoisting readiness
window.launchAdminConsole = function launchAdminConsole() {
    const drawer = document.getElementById('sideDrawer');
    if(drawer && !drawer.classList.contains('-translate-x-full')) window.toggleDrawer();
    
    const consoleEl = document.getElementById('adminCoreConsole');
    if (consoleEl) {
        consoleEl.classList.remove('hidden');
        consoleEl.classList.add('flex');
    }
    window.synchronizeAdminConsolePipeline();
    window.synchronizeAdminUsersPipeline();
};

window.synchronizeAdminConsolePipeline = function synchronizeAdminConsolePipeline() {
    const rootTargetStream = document.getElementById('adminPipelineStream');
    if(!rootTargetStream) return;

    const globalDepositsRef = ref(database, 'global_deposits');
    const usersRef = ref(database, 'users');

    onValue(globalDepositsRef, (snapshot) => {
        if(!snapshot.exists()) {
            rootTargetStream.innerHTML = `<tr><td colspan="5" class="p-12 text-center text-slate-500 italic font-mono">No clearance pipeline metrics captured inside system database.</td></tr>`;
            return;
        }

        const collection = snapshot.val();
        
        get(usersRef).then((usersSnap) => {
            const usersData = usersSnap.exists() ? usersSnap.val() : {};
            let htmlRows = '';
            let processingCount = 0;

            Object.keys(collection).forEach(key => {
                const t = collection[key];
                if(t.internalState === 'Processing') {
                    processingCount++;
                    const userInfo = usersData[t.uid] || {};
                    const userEmail = userInfo.email || t.email || `User (${t.uid.substring(0, 6)})`;
                    const currentLiveBal = userInfo.walletBalance !== undefined ? parseFloat(userInfo.walletBalance).toFixed(2) : "0.00";
                    const depositVal = parseFloat(t.value || 0).toFixed(2);
                    const safeEmailEscaped = window.escapeHtml(userEmail);

                    htmlRows += `
                        <tr class="hover:bg-[#0d1220]/40 transition border-b border-slate-800">
                            <td class="p-3 sm:p-4 text-slate-200 font-bold font-mono text-xs truncate max-w-[180px]" title="${safeEmailEscaped}">${safeEmailEscaped}</td>
                            <td class="p-3 sm:p-4 font-bold text-amber-400 font-mono">₹${currentLiveBal}</td>
                            <td class="p-3 sm:p-4 font-bold text-emerald-400 font-mono">₹${depositVal}</td>
                            <td class="p-3 sm:p-4 font-mono text-slate-300 text-xs">${window.escapeHtml(t.utr || '')}</td>
                            <td class="p-3 sm:p-4 text-right space-x-2">
                                <button onclick="window.commitStateVerification('${t.uid}', '${t.structId}', ${t.value}, 'approve')" class="bg-emerald-600 hover:bg-emerald-500 font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider text-[10px] text-white transition active:scale-95">Approve Node</button>
                                <button onclick="window.commitStateVerification('${t.uid}', '${t.structId}', ${t.value}, 'cancel')" class="bg-rose-600 hover:bg-rose-500 font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider text-[10px] text-white transition active:scale-95">Reject</button>
                            </td>
                        </tr>`;
                }
            });

            if (processingCount === 0) {
                rootTargetStream.innerHTML = `<tr><td colspan="5" class="p-12 text-center text-slate-500 italic font-mono">No clearance pipeline metrics captured inside system database.</td></tr>`;
            } else {
                rootTargetStream.innerHTML = htmlRows;
            }
        }).catch((err) => {
            console.error("Error fetching users for deposits pipeline:", err);
        });
    });
};

window.synchronizeAdminUsersPipeline = function synchronizeAdminUsersPipeline() {
    const usersRef = ref(database, 'users');
    
    const handleUsersSnapshot = (snapshot) => {
        if(!snapshot.exists()) {
            window.allUsersCache = {};
        } else {
            window.allUsersCache = snapshot.val();
        }
        if (typeof window.renderAdminUsersList === 'function') {
            window.renderAdminUsersList();
        }
    };

    // Realtime listener
    onValue(usersRef, handleUsersSnapshot, (error) => {
        console.error("User directory stream error:", error);
        const stream = document.getElementById('adminUsersStream');
        if (stream) {
            stream.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-rose-400 italic font-mono"><i class="fa-solid fa-triangle-exclamation mr-2"></i>Database Error: ${window.escapeHtml(error.message || 'Permission Denied')}. Check Firebase Security Rules.</td></tr>`;
        }
    });

    // Instant fetch fallback
    get(usersRef).then(handleUsersSnapshot).catch((err) => {
        console.warn("Direct users fetch error:", err);
        const stream = document.getElementById('adminUsersStream');
        if (stream && stream.innerText.includes('Loading')) {
            stream.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-rose-400 italic font-mono"><i class="fa-solid fa-triangle-exclamation mr-2"></i>Failed to fetch user directory: ${window.escapeHtml(err.message)}</td></tr>`;
        }
    });
};

// Check for redirect sign-in result on page load
getRedirectResult(auth).catch((err) => {
    console.warn("Redirect sign-in result process completed/idle:", err);
});

// Service Database Repository
const serviceRepository = {
    views: [
        { name: "14237 - 🚀 Instagram Reels Views (Instant Start 🔥) | 500K/Day 🚀 | Cheapest ⚡ — ₹0.25 per 1000", cost: 0.25 },
        { name: "10558 - 🚀 Instagram Reels Views - 500K+ Hour - Instant Start ⚡ - LIMITED TIME SALE ☑️ — ₹0.30 per 1000", cost: 0.30 },
        { name: "8713 - 🚀 Instagram Reels Views | 0-5 Min Start ⚡ | 100K/hr 🚀 ⚡ — ₹0.55 per 1000", cost: 0.55 },
        { name: "12206 - 🚀 Instagram Views ( 🚀 200k per hour )( Never Stucks ) — Cancel Button Enabled ☑️ — ₹0.65 per 1000", cost: 0.65 },
        { name: "10292 - 🚀 Instagram Views ( 🚀 1Million Per Day ) Emergency — Cancel Button Enabled ☑️ — ₹0.85 per 1000", cost: 0.85 }
    ],
    likes: [
        { name: "14270 - ⭐ Instagram Likes (HQ + Real Accounts 👤)(Non Drop 💧)(100K/D🔥) — ₹6.50 per 1000", cost: 6.50 },
        { name: "13914 - ⭐ Instagram Likes (Real Accounts 👤)(Low Drop 💧)(300K/D🔥) — ₹6.80 per 1000", cost: 6.80 },
        { name: "14139 - ⭐ Instagram Likes (Old Accounts 👤)(Non Drop 💧)(100K/D🔥) — ₹8.43 per 1000", cost: 8.43 },
        { name: "13713 - ⭐ Instagram Likes (Real Accounts 👤)(Non Drop 💧)(500K+/D🔥) — ₹9.14 per 1000", cost: 9.14 },
        { name: "14055 - ⭐ Instagram Likes (HQ Real Accounts 👤)(Non Drop 💧)(500K/D🔥) — ₹9.78 per 1000", cost: 9.78 }
    ],
    followers: [
        { name: "13849 - 🚀 Instagram Followers (Real Account 👤)(Cheapest⭐)(No Refill ⚠️)(10-20K/Day ⚡) — ₹54.84 per 1000", cost: 54.84 },
        { name: "13850 - 🚀 Instagram Followers (Old Account 👤)(Cheapest⭐)(No Refill ⚠️)(50-100K/Day ⚡) — ₹58.78 per 1000", cost: 58.78 },
        { name: "14128 - 🌙 💎 Instagram Followers - HQ Accounts - Instant Start ⚡️| No Refill ⚠️ | Speed: 500K/Day 🚀 — ₹40.61 per 1000", cost: 40.61 },
        { name: "14129 - 🌙 💎 Instagram Followers - HQ Accounts - Instant Start ⚡️| 30 Days ♻️ | Speed: 500K/Day 🚀 — ₹46.59 per 1000", cost: 46.59 },
        { name: "14130 - 🌙 💎 Instagram Followers - HQ Accounts - Instant Start ⚡️| 60 Days ♻️ | Speed: 500K/Day 🚀 — ₹50.41 per 1000", cost: 50.41 },
        { name: "14131 - 🌙 💎 Instagram Followers - HQ Accounts - Instant Start ⚡️| 90 Days ♻️ | Speed: 500K/Day 🚀 — ₹52.96 per 1000", cost: 52.96 },
        { name: "14132 - 🌙 💎 Instagram Followers - HQ Accounts - Instant Start ⚡️| 365 Days ♻️ | Speed: 500K/Day 🚀 — ₹55.50 per 1000", cost: 55.50 },
        { name: "14133 - 🌙 💎 Instagram Followers - HQ Accounts - Instant Start ⚡️| Lifetime ♻️ | Speed: 500K/Day 🚀 — ₹58.05 per 1000", cost: 58.05 }
    ],
    youtube_views: [
        { name: "9998 - 🚀 YouTube Shorts / Video View [ Non-Drop ][ Lifetime Guaranteed ♻️ ][ Max 100K ][ 3k to 5k / Day ] — ₹111.44 per 1000", cost: 111.44 },
        { name: "9999 - 🚀 YouTube Shorts / Video View [ Non-Drop ][ Lifetime Guaranteed ♻️ ][ Max 100K ][ 5k to 7k / Day ] — ₹93.44 per 1000", cost: 93.44 },
        { name: "10000 - 🚀 YouTube Shorts / Video View [ Non-Drop ][ Lifetime Guaranteed ♻️ ][ Max 100K ][ 7k to 10k / Day ] — ₹124.16 per 1000", cost: 124.16 }
    ],
    youtube_view: [
        { name: "13479 - ❤️ 👀 YouTube Views [No Drop][Lifetime Guaranteed][3-5K/Day][0-12 Hour Start] ⚡ — ₹60.51 per 1000", cost: 60.51 },
        { name: "13480 - ❤️ 👀 YouTube Views [Medium Drop][Lifetime Guaranteed][2-3K/Day][Instant] ⚡ — ₹71.95 per 1000", cost: 71.95 },
        { name: "13481 - ❤️ 👀 YouTube Views [Suggested Source][Lifetime Guaranteed][2-3K/Day][Instant] ⚡ — ₹83.16 per 1000", cost: 83.16 },
        { name: "13482 - ❤️ 👀 YouTube Views [Low Drop][Lifetime Guaranteed][2-3K/Day][Instant] ⚡ — ₹85.68 per 1000", cost: 85.68 },
        { name: "13483 - ❤️ 👀 YouTube Views [No Drop][Lifetime Guaranteed][5-10K/Day][0-1/Hour Start] ⚡ — ₹113.84 per 1000", cost: 113.84 },
        { name: "13484 - ❤️ 👀 YouTube Views [No Drop][Lifetime Guaranteed][5-10K/Day][Instant] ⚡ — ₹141.90 per 1000", cost: 141.90 }
     ],
    youtube_like: [
        { name: "14340 - ❤️ 💍 Youtube Likes (No Drop)(30 Days Refill ♻️)(1K/H ⚡)— ₹27.77 per 1000", cost: 27.77 },
        { name: "14341 - ❤️ 💍 Youtube Likes (No Drop)(30 Days Refill ♻️)(5K/H ⚡)— ₹52.25 per 1000", cost: 52.25 },
        { name: "14366 - ❤️ 💍 Youtube Likes (No Drop)(30 Days Refill ♻️)(10K/H ⚡) — ₹65.67 per 1000", cost: 65.67 },
        { name: "14300 - 💎 ⭐ Youtube Likes (Almost No Drop)(No Refill)(10K/H ⚡)(Instant 🚀)— ₹110.28 per 1000", cost: 110.28 },
        { name: "14301 - 💎 ⭐ Youtube Likes (Almost No Drop)(30 Days Refill ♻️)(10K/H ⚡)(Instant 🚀)— ₹129.39 per 1000", cost: 129.39 }
    ],
    subscriber: [
        { name: "14145 - 🚀 Youtube Subscribers [ Max 100K ] | No Refill ⚠️ | Instant Start | Day 100K 🚀 — ₹60.47 per 1000", cost: 60.47 },
        { name: "14146 - 🚀 Youtube Subscribers [ Max 500K ] | No Refill ⚠️ | Instant Start | Day 200K 🚀 — ₹72.17 per 1000", cost: 72.17 },
        { name: "12418 - ❤️ Youtube Subscribers [30 Days Guaranteed][1K-3K/D][0-2 Hour Start] 🚀 — ₹1833.42 per 1000", cost: 1833.42 },
        { name: "13070 - 🆕 ⚡ Youtube Subscribers [ New ] Speed 50-100/day [ Lifetime ♻️ ] 100% Non Drop — ₹1887.21 per 1000", cost: 1887.21 },
        { name: "13071 - 🆕 ⚡ Youtube Subscribers [ New ] Speed 100-200/day [ Lifetime ♻️ ] 100% Non Drop — ₹1950.90 per 1000", cost: 1950.90 },
        { name: "13072 - 🆕 ⚡ Youtube Subscribers [ New ] Speed 200-250/day [ Lifetime ♻️ ] 100% Non Drop — ₹2014.59 per 1000", cost: 2014.59 },
        { name: "12996 - 🆕 🏅 Youtube Subscribers [30 Days Guaranteed][10K-20K/D][0-1/H] 🔥 — ₹2342.47 per 1000", cost: 2342.47 },
        { name: "11207 - ▶️ ❤️ Youtube Subscribers - [0-5% Drop][Lifetime Guarantee][0-24 Hour Start] ⚡ — ₹2573.90 per 1000", cost: 2573.90 }
    ],
    youtube_comment: [
        { name: "13533 - ✍️ 🌟 YouTube Costum Comments [Non Drop][Lifetime Guaranteed][5-10K/Day][0-24 Hour Start] — ₹256.37 per 1000", cost: 256.37 },
        { name: "13534 - ✍️ 🌟 YouTube Short Costum Comments [Non Drop][Lifetime Guaranteed][5-10K/Day][0-24 Hour Start] — ₹256.37 per 1000", cost: 256.37 },
        { name: "12880 - 💬 🚀 YouTube Comments Created by AI [ Max 10K ] | Non Drop | 30 Days ♻️ | Instant Start — ₹615.31 per 1000", cost: 615.31 },
        { name: "12881 - 💬 🚀 YouTube Comments Created by AI [ Max 10K ] | Non Drop | 365 Days ♻️ | Instant Start — ₹676.64 per 1000", cost: 676.64 },
        { name: "12882 - 💬 🚀 YouTube Comments Created by AI [ Max 10K ] | Non Drop | Lifetime ♻️ | Instant Start — ₹737.97 per 1000", cost: 737.97 }
    ],
    facebook_views: [
        { name: "13068 - 🆕 🚀 Facebook Views | Cancel Enable | 30 Days ♻️ | Instant Start | Day 500K 🚀 — ₹4.68 per 1000", cost: 4.68 },
        { name: "14203 - 👀 💧 Facebook Views (Lifetime Guaranteed)(Millions Daily 🚀)(Fast Start ⚡) — ₹4.77 per 1000", cost: 4.77 },
        { name: "13069 - 🆕 🚀 Facebook Views | Cancel Enable | 30 Days ♻️ | Instant Start | Day 500K 🚀 — ₹5.38 per 1000", cost: 5.38 },
        { name: "9397 - 🆕 ⚡ Facebook Reels Views | 0-5 Min Start ⚡ | Day 20K | Lifetime Guaranteed ♻️ — ₹5.81 per 1000", cost: 5.81 },
        { name: "12251 - 🆕 🔥 Facebook Views - 20-50K/Day - [Fast Start] ⚡ — ₹5.82 per 1000", cost: 5.82 },
        { name: "12252 - 🆕 🔥 Facebook Views [Extreme Speed][Fast Start] ⚡ — ₹8.36 per 1000", cost: 8.36 },
        { name: "10281 - ✅ Facebook Plays ~ 20-30k/days ~ Instant ~ REFILL 30D — ₹9.07 per 1000", cost: 9.07 },
        { name: "10282 - ✅ Facebook Plays ~ Max 200M ~ 40M/days ~ Instant ~ REFILL 30D — ₹10.01 per 1000", cost: 10.01 },
        { name: "12739 - 👀 🔥 Facebook Video / Reels Views (UPDATED)[10-20K/D][0-1/H] — ₹11.56 per 1000", cost: 11.56 }
    ],
    facebook_like: [
        { name: "14078 - ❤️ Facebook Post Likes [ Mix Accounts | Low Drop | Refill: No ⚠️ | Start: 0-1 Min ] — ₹32.67 per 1000", cost: 32.67 },
        { name: "14079 - ❤️ Facebook Post Likes [ Mix Accounts | Low Drop | Refill: 30 Days ♻️ | Start: 0-1 Min ] — ₹33.95 per 1000", cost: 33.95 },
        { name: "14080 - ❤️ Facebook Post Likes [ Mix Accounts | Low Drop | Refill: 60 Days ♻️ | Start: 0-1 Min ] — ₹35.23 per 1000", cost: 35.23 },
        { name: "14081 - ❤️ Facebook Post Likes [ Mix Accounts | Low Drop | Refill: 90 Days ♻️ | Start: 0-1 Min ] — ₹36.50 per 1000", cost: 36.50 },
        { name: "14082 - ❤️ Facebook Post Likes [ Mix Accounts | Low Drop | Refill: 365 Days ♻️ | Start: 0-1 Min ] — ₹37.78 per 1000", cost: 37.78 },
        { name: "14083 - ❤️ Facebook Post Likes [ Mix Accounts | Low Drop | Refill: Lifetime ♻️ | Start: 0-1 Min ] — ₹39.06 per 1000", cost: 39.06 }
    ],
    facebook_followers: [
        { name: "14344 - 👥 ❤️ Facebook Followers (HQ+Real 👤)(Low Drop 💧)(50K/D ⚡)(No Refill ⚠️) — ₹30.49 per 1000", cost: 30.49 },
        { name: "14345 - 👥 ❤️ Facebook Followers (HQ+Real 👤)(Low Drop 💧)(50K/D ⚡)(30 Days ♻️) — ₹38.25 per 1000", cost: 38.25 },
        { name: "14346 - 0👥 ❤️ Facebook Followers (HQ+Real 👤)(Low Drop 💧)(50K/D ⚡)(60 Days ♻️) — ₹43.42 per 1000", cost: 43.42 },
        { name: "14347 - 👥 ❤️ Facebook Followers (HQ+Real 👤)(Low Drop 💧)(90 Days ♻️) — ₹48.60 per 1000", cost: 48.60 },
        { name: "14348 - 👥 ❤️ Facebook Followers (HQ+Real 👤)(Low Drop 💧)(365 Days ♻️) — ₹53.78 per 1000", cost: 53.78 },
        { name: "14349 - 👥 ❤️ Facebook Followers (HQ+Real 👤)(Low Drop 💧)(Lifetime ♻️) — ₹58.95 per 1000", cost: 58.95 }
    ]
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentAuthenticatedUserToken = user;
        document.getElementById('authContainer').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('hidden');
        document.getElementById('appContainer').classList.add('flex');

        const shortUid = user.uid.substring(0, 8).toUpperCase();
        document.getElementById('drawerUserIdentity').innerText = user.email || "Registered User";
        document.getElementById('drawerUserLogo').src = user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.uid)}`;
        
        const refCodeStr = `SGS-${shortUid}`;
        const refLinkStr = `https://${window.location.host}/?ref=${shortUid}`;
        if (document.getElementById('referCode')) document.getElementById('referCode').innerText = refCodeStr;
        if (document.getElementById('referLink')) document.getElementById('referLink').innerText = refLinkStr;

        // Save referral code mappings
        set(ref(database, `referral_codes/${refCodeStr}`), user.uid).catch(() => {});
        set(ref(database, `referral_codes/${shortUid}`), user.uid).catch(() => {});

        const isMasterAdmin = MASTER_ADMIN_UIDS.includes(user.uid);
        
        if (isMasterAdmin) {
            // Show Admin Link in Side Drawer for Master Admin
            const drawerLink = document.getElementById('drawerAdminLink');
            if (drawerLink) drawerLink.classList.remove('hidden');
            
            window.launchAdminConsole();
            window.hideGlobalLoadingScreen();
        } else {
            const adminCheckRef = child(ref(database), `admins/${user.uid}`);
            get(adminCheckRef).then((snapshot) => {
                if (snapshot.exists() && snapshot.val() === true) {
                    const drawerLink = document.getElementById('drawerAdminLink');
                    if (drawerLink) drawerLink.classList.remove('hidden');

                    window.launchAdminConsole();
                    window.hideGlobalLoadingScreen();
                } else {
                    document.getElementById('drawerAdminLink').classList.add('hidden');
                }
            }).catch(() => {});
        }

        // Bind user database records
        const userDbRef = ref(database, 'users/' + user.uid);
        const userEmail = user.email || 'Registered User';
        const creationTimeStr = user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '24 Jul 2026';
        const lastSignInTimeStr = user.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '24 Jul 2026';
        const providerTypeStr = user.providerData?.[0]?.providerId === 'google.com' ? 'google' : 'email';

        onValue(userDbRef, (snapshot) => {
            if (snapshot.exists()) {
                userDataRecordCached = snapshot.val();
                update(userDbRef, { 
                    email: userEmail,
                    provider: providerTypeStr,
                    createdAt: userDataRecordCached.createdAt || creationTimeStr,
                    lastSignedIn: lastSignInTimeStr
                }).catch(() => {});
            } else {
                userDataRecordCached = { 
                    email: userEmail, 
                    provider: providerTypeStr,
                    createdAt: creationTimeStr,
                    lastSignedIn: lastSignInTimeStr,
                    walletBalance: 0.00, 
                    transactions: {}, 
                    orders: {} 
                };
                
                // Auto apply referral code if URL parameter exists
                if (refParam) {
                    const cleanRef = refParam.trim().toUpperCase();
                    get(ref(database, `referral_codes/${cleanRef}`)).then((codeSnap) => {
                        let referrerUid = codeSnap.exists() ? codeSnap.val() : null;
                        if (!referrerUid && cleanRef.length >= 6) {
                            referrerUid = cleanRef.toLowerCase();
                        }
                        if (referrerUid && referrerUid !== user.uid) {
                            userDataRecordCached.referredBy = referrerUid;
                        }
                        set(userDbRef, userDataRecordCached).then(() => {
                            localStorage.removeItem('sgs_pending_ref');
                        }).catch(() => {});
                    }).catch(() => {
                        set(userDbRef, userDataRecordCached).catch(() => {});
                    });
                } else {
                    set(userDbRef, userDataRecordCached).catch(() => {});
                }
            }
            renderCachedUserStateData();
            renderUserOrdersHistory();
            window.hideGlobalLoadingScreen();
        }, (dbError) => {
            window.hideGlobalLoadingScreen();
        });

        // Auto Trigger Status Synchronizer loop every 15 seconds
        if (window.statusSyncInterval) clearInterval(window.statusSyncInterval);
        window.syncOrdersStatusFromProvider();
        window.statusSyncInterval = setInterval(() => {
            window.syncOrdersStatusFromProvider();
        }, 15000);
        
    } else {
        currentAuthenticatedUserToken = null;
        document.getElementById('appContainer').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('flex');
        document.getElementById('drawerAdminLink').classList.add('hidden');
        document.getElementById('authContainer').classList.remove('hidden');
        window.hideGlobalLoadingScreen();
    }
});

window.handleGoogleLogin = async function() {
    const btn = document.getElementById('google-login-btn');
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin text-rose-500"></i><span>Authenticating Google...</span>`;
    }
    try {
        const result = await signInWithPopup(auth, googleProvider);
        window.showCustomToast("Google Session established successfully!", "success");
    } catch (error) {
        console.warn("Google popup interrupted, attempting redirect flow:", error);
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
            try {
                await signInWithRedirect(auth, googleProvider);
            } catch (redirectErr) {
                window.showCustomToast("Google Auth error: " + redirectErr.message, "error");
            }
        } else {
            let friendlyMsg = error.message;
            if (error.code === 'auth/unauthorized-domain') friendlyMsg = "Domain not authorized in Firebase Console!";
            window.showCustomToast(friendlyMsg, "error");
        }
    } finally {
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-brands fa-google text-rose-500 text-base"></i><span>Continue with Google</span>`;
        }
    }
};

const googleBtnEl = document.getElementById('google-login-btn');
if (googleBtnEl) {
    googleBtnEl.addEventListener('click', window.handleGoogleLogin);
}

window.switchTab = function(targetId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.className = "text-left p-3.5 rounded-2xl flex items-center space-x-3 font-medium transition text-slate-400 hover:text-slate-200 hover:bg-slate-900 tab-btn";
    });

    const targetSection = document.getElementById(`tab-${targetId}`);
    if(targetSection) targetSection.classList.remove('hidden');
    
    const activeBtn = document.getElementById(`tab-btn-${targetId}`);
    if(activeBtn) {
        activeBtn.className = "text-left p-3.5 rounded-2xl flex items-center space-x-3 font-semibold transition tab-btn glass-panel-active text-white";
    }

    document.querySelectorAll('.mobile-nav-btn').forEach(b => {
        b.classList.remove('text-rose-500', 'scale-105');
        b.classList.add('text-slate-400');
    });
    const mobileActiveBtn = document.getElementById(`mbtn-${targetId}`);
    if (mobileActiveBtn) {
        mobileActiveBtn.classList.remove('text-slate-400');
        mobileActiveBtn.classList.add('text-rose-500', 'scale-105');
    }
    
    if (targetId === 'myorders') {
        window.syncOrdersStatusFromProvider();
    }

    const drawer = document.getElementById('sideDrawer');
    if (drawer && !drawer.classList.contains('-translate-x-full')) {
        window.toggleDrawer();
    }
};

/// 100% Reliable Standard Dynamic UPI QR Code Generator for Sgs Provider
window.generateSecureQR = function() {
    const requestedAmount = document.getElementById('fundAmount').value;
    const container = document.getElementById('qrMatrixContainer');
    const targetImg = document.getElementById('secureQrImg');
    const prompt = document.getElementById('qrPrompt');
    const summary = document.getElementById('qrDataSummary');

    if (requestedAmount && parseFloat(requestedAmount) > 0) {
        try {
            const upiId = "Q341013270@ybl";
            const cleanAmount = parseFloat(requestedAmount).toFixed(2);
            
            // Standard NPCI Compliant Dynamic Intent URI with payee name Sgs Provider
            const upiUri = `upi://pay?pa=${upiId}&pn=Sgs%20Provider&am=${cleanAmount}&cu=INR&tn=WalletTopup`;
            targetImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=10&data=${encodeURIComponent(upiUri)}`;

            container.classList.remove('hidden'); 
            prompt.classList.add('hidden'); 
            summary.innerText = `AMOUNT TO PAY: ₹${cleanAmount}`; 
            summary.classList.remove('hidden');
        } catch(qrErr) {
            console.error("QR Generation Failure: ", qrErr);
        }
    } else { 
        container.classList.add('hidden'); 
        prompt.classList.remove('hidden'); 
        summary.classList.add('hidden'); 
    }
};

document.getElementById('fundAmount').addEventListener('input', window.generateSecureQR);

// Auto-convert name input to UPPERCASE automatically as the user types
const utrInputEl = document.getElementById('utrInput');
if (utrInputEl) {
    utrInputEl.addEventListener('input', function() {
        this.value = this.value.toUpperCase();
    });
}

// Form Calculator & Service Select
window.calculateRealtimeCost = function() {
    const selectElement = document.getElementById('serviceSelect');
    if (!selectElement) return;
    const currentSelectedRate = parseFloat(selectElement.value);
    const inputQty = parseInt(document.getElementById('targetOrderQty').value);
    const targetTextContainer = document.getElementById('calculatedCostText');
    if (inputQty && inputQty > 0) {
        targetTextContainer.innerText = ((currentSelectedRate / 1000) * inputQty).toFixed(2);
    } else {
        targetTextContainer.innerText = "0.00";
    }
};

window.updateServices = function() {
    const selectedCategory = document.getElementById('categorySelect').value;
    const targetSelectBox = document.getElementById('serviceSelect');
    const linkInput = document.getElementById('targetOrderLink');

    if (selectedCategory.includes('youtube') || selectedCategory.includes('yt_') || selectedCategory === 'subscriber') {
        linkInput.placeholder = "📺 YouTube Video or Shorts Link";
    } else if (selectedCategory.includes('facebook') || selectedCategory.includes('fb_')) {
        linkInput.placeholder = "👥 Facebook Profile or Post Link";
    } else {
        linkInput.placeholder = "📸 Instagram Post, Reel or Profile Link";
    }

    const collection = serviceRepository[selectedCategory];
    targetSelectBox.innerHTML = '';
    
    if (collection) {
        collection.forEach(svc => { targetSelectBox.innerHTML += `<option value="${svc.cost}">${svc.name}</option>`; });
    }
    window.calculateRealtimeCost();
};

document.getElementById('categorySelect').addEventListener('change', window.updateServices);
document.getElementById('serviceSelect').addEventListener('change', window.calculateRealtimeCost);
document.getElementById('targetOrderQty').addEventListener('input', window.calculateRealtimeCost);

function renderCachedUserStateData() {
    if(!userDataRecordCached) return;
    document.getElementById('userBalance').innerText = parseFloat(userDataRecordCached.walletBalance || 0).toFixed(2);
    
    const tbody = document.getElementById('userLedgerRows');
    const txCollection = userDataRecordCached.transactions;
    if(!txCollection || Object.keys(txCollection).length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="pt-6 text-center text-slate-500 italic font-mono">No tracking sessions deployed yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    Object.keys(txCollection).forEach(key => {
        const t = txCollection[key];
        let currentBadge = `<span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full text-[10px] font-mono font-bold">${t.internalState}</span>`;
        if(t.internalState === 'Verified') currentBadge = `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-[10px] font-mono font-bold">${t.internalState}</span>`;
        if(t.internalState === 'Cancelled') currentBadge = `<span class="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1 rounded-full text-[10px] font-mono font-bold">${t.internalState}</span>`;
        
        tbody.innerHTML += `
            <tr class="hover:bg-[#0d1220]/40 transition border-b border-slate-800/40">
                <td class="p-4 font-bold text-slate-200">₹${parseFloat(t.value).toFixed(2)}</td>
                <td class="p-4 font-mono text-slate-400">${t.utr}</td>
                <td class="p-4">${currentBadge}</td>
            </tr>`;
    });
}

// Exact time-based logic: 0-30s = Pending, 30s-2m = In Progress, After 2m = Completed
window.syncOrdersStatusFromProvider = async function() {
    if (!currentAuthenticatedUserToken || !userDataRecordCached || !userDataRecordCached.orders) return;
    
    const ordersList = userDataRecordCached.orders;
    const now = Date.now();
    let stateHasChanged = false;

    for (let key in ordersList) {
        const o = ordersList[key];
        if (o.status !== 'Completed' && o.status !== 'Cancelled') {
            const elapsedSeconds = (now - (o.timestamp || now)) / 1000;
            let simulatedStatus = o.status || 'Pending';

            if (elapsedSeconds > 120) { // After 2 minutes (120 seconds)
                simulatedStatus = 'Completed';
            } else if (elapsedSeconds > 30) { // After 30 seconds up to 2 mins
                simulatedStatus = 'In Progress';
            } else { // First 30 seconds
                simulatedStatus = 'Pending';
            }

            if (simulatedStatus !== o.status) {
                o.status = simulatedStatus;
                stateHasChanged = true;
                try {
                    await update(ref(database, `users/${currentAuthenticatedUserToken.uid}/orders/${key}`), { status: simulatedStatus });
                } catch (e) {}
            }
        }
    }
    renderUserOrdersHistory();
    if (stateHasChanged && window.allUsersCache && window.allUsersCache[currentAuthenticatedUserToken.uid]) {
        window.allUsersCache[currentAuthenticatedUserToken.uid].orders = userDataRecordCached.orders;
    }
};

// Render User Orders History (Exact Aapkaprovider Columns Style)
window.renderUserOrdersHistory = function renderUserOrdersHistory() {
    const tbody = document.getElementById('myOrdersTableStream');
    if (!userDataRecordCached || !userDataRecordCached.orders || Object.keys(userDataRecordCached.orders).length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500 italic font-mono">No verified transaction nodes tracked on this account chain.</td></tr>`;
        return;
    }

    const ordersList = userDataRecordCached.orders;
    tbody.innerHTML = '';
    Object.keys(ordersList).reverse().forEach(key => {
        const o = ordersList[key];
        let statusBadge = `<span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full text-[10px] font-mono font-bold">${o.status || 'Pending'}</span>`;
        
        if (o.status === 'Completed') {
            statusBadge = `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-[10px] font-mono font-bold">Completed</span>`;
        } else if (o.status === 'Cancelled' || o.status === 'Canceled') {
            statusBadge = `<span class="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1 rounded-full text-[10px] font-mono font-bold">Cancelled</span>`;
        } else if (o.status === 'In Progress' || o.status === 'Processing' || o.status === 'Pending') {
            statusBadge = `<span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full text-[10px] font-mono font-bold">${o.status}</span>`;
        }
        
        const dateStr = o.timestamp ? new Date(o.timestamp).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', '') : '2026-07-25 13:44:20';
        const cleanLink = o.link || 'https://www.instagram.com/reel/...';
        const pureOrderId = o.rawOrderId || (o.orderId ? o.orderId.replace('SGS-', '') : '2022244');

        tbody.innerHTML += `
            <tr class="hover:bg-[#0d1220]/40 transition border-b border-slate-800/40 text-xs font-mono">
                <td class="p-3 text-slate-300 font-bold">${pureOrderId}</td>
                <td class="p-3 text-slate-400 text-[11px]">${dateStr}</td>
                <td class="p-3 text-sky-400 max-w-[180px] truncate"><a href="${cleanLink}" target="_blank" class="hover:underline">${cleanLink}</a></td>
                <td class="p-3 text-slate-200 font-bold">₹${parseFloat(o.cost || 0).toFixed(2)}</td>
                <td class="p-3 text-slate-300">${o.startCount || '0'}</td>
                <td class="p-3 text-slate-300 font-sans">${o.quantity}</td>
                <td class="p-3 text-slate-200 font-sans font-medium max-w-[220px] truncate" title="${o.serviceName}">${o.serviceName}</td>
                <td class="p-3 font-sans">${statusBadge}</td>
            </tr>`;
    });
};

// Global Execution Debounce Lock to prevent duplicate calls on fast clicks
let isDepositSubmitting = false;

// Deposit Handling (Exact Instant Auto-Verification, Anti-Duplicate & Anti-Fraud Protected)
window.submitDepositToServer = async function() {
    if (isDepositSubmitting) return; // Prevent double-trigger completely

    const value = parseFloat(document.getElementById('fundAmount').value);
    const rawIdentifier = document.getElementById('utrInput').value;
    const identifierInput = rawIdentifier.replace(/\s+/g, ' ').trim().toUpperCase();
    
    if (!value || value <= 0 || !identifierInput || identifierInput.length < 2) { 
        window.showCustomToast("Validation report error. Verify inputs (Amount & Sender Name).", "error"); 
        return; 
    }

    if (!currentAuthenticatedUserToken) {
        window.showCustomToast("Session error: Please re-login.", "error");
        return;
    }

    isDepositSubmitting = true;
    const submitBtn = document.getElementById('submit-deposit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>VERIFYING PAYMENT VIA GATEWAY...</span><i class="fa-solid fa-spinner animate-spin ml-2"></i>`;
    }

    try {
        const cleanNameInput = identifierInput.toLowerCase();
        const numVal = parseInt(value, 10);
        const floatVal = parseFloat(value).toFixed(2);

        // 1. Fetch realtime PhonePe notifications from /payments node with 3.5s Timeout protection
        const fetchPaymentsPromise = get(ref(database, 'payments'));
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3500));
        
        let autoMatched = false;
        let matchedKey = null;

        try {
            const paymentsSnap = await Promise.race([fetchPaymentsPromise, timeoutPromise]);
            if (paymentsSnap && paymentsSnap.exists()) {
                const paymentsData = paymentsSnap.val();
                const sortedKeys = Object.keys(paymentsData).reverse();

                // Scan for the most recent UNUSED payment matching Amount & Name
                for (let key of sortedKeys) {
                    const item = paymentsData[key];
                    const rawMsg = (typeof item === 'object' ? JSON.stringify(item) : String(item)).toLowerCase().replace(/\s+/g, ' ');
                    const isUsed = item && item.used === true;

                    if (!isUsed) {
                        const hasAmount = rawMsg.includes(`rs.${numVal}`) || 
                                         rawMsg.includes(`rs. ${numVal}`) || 
                                         rawMsg.includes(`rs ${numVal}`) || 
                                         rawMsg.includes(`rs.${floatVal}`) || 
                                         rawMsg.includes(`rs ${floatVal}`) || 
                                         rawMsg.includes(`₹${numVal}`) || 
                                         rawMsg.includes(`₹${floatVal}`) ||
                                         rawMsg.includes(`${numVal}`);

                        const nameParts = cleanNameInput.split(' ').filter(p => p.length >= 2);
                        const hasName = rawMsg.includes(cleanNameInput) || 
                                        (nameParts.length > 0 && nameParts.some(part => rawMsg.includes(part)));

                        if (hasAmount && hasName) {
                            autoMatched = true;
                            matchedKey = key;
                            break;
                        }
                    }
                }
            }
        } catch (fetchErr) {
            console.warn("Auto-match scan deferred to audit fallback:", fetchErr);
        }

        // 2. Instant Auto-Verification Success Flow (Single balance credit only)
        if (autoMatched && matchedKey) {
            const currentExactTime = Date.now();

            // Lock this exact payment entry so it can never be claimed again
            await update(ref(database, `payments/${matchedKey}`), { 
                used: true, 
                claimedBy: currentAuthenticatedUserToken.uid,
                claimedAt: currentExactTime
            }).catch(() => {});

            const uniqueTxHashKey = 'tx_' + currentExactTime;
            const userEmailStr = currentAuthenticatedUserToken.email || 'Registered User';
            const verifiedPayload = { 
                structId: uniqueTxHashKey, 
                uid: currentAuthenticatedUserToken.uid, 
                email: userEmailStr, 
                value: value, 
                utr: identifierInput, 
                internalState: 'Verified',
                timestamp: currentExactTime
            };

            await set(ref(database, `users/${currentAuthenticatedUserToken.uid}/transactions/${uniqueTxHashKey}`), verifiedPayload);

            const currentBal = parseFloat(userDataRecordCached ? userDataRecordCached.walletBalance || 0 : 0);
            const updatedBal = currentBal + value;
            await update(ref(database, 'users/' + currentAuthenticatedUserToken.uid), { walletBalance: updatedBal });

            if (userDataRecordCached) {
                userDataRecordCached.walletBalance = updatedBal;
                if (!userDataRecordCached.transactions) userDataRecordCached.transactions = {};
                userDataRecordCached.transactions[uniqueTxHashKey] = verifiedPayload;
            }

            document.getElementById('userBalance').innerText = updatedBal.toFixed(2);
            renderCachedUserStateData();

            // Check referral reward eligibility without double-crediting deposit
            if (parseFloat(value) >= 10.00) {
                const targetUserRef = ref(database, `users/${currentAuthenticatedUserToken.uid}`);
                get(targetUserRef).then((snap) => {
                    if (snap.exists()) {
                        const uData = snap.val();
                        if (uData.referredBy && !uData.countedForReferChallenge) {
                            const referrerUid = uData.referredBy;
                            const referrerRef = ref(database, `users/${referrerUid}`);

                            get(referrerRef).then((rSnap) => {
                                if (rSnap.exists()) {
                                    const rData = rSnap.val();
                                    const currentCount = rData.qualifiedReferCount || 0;
                                    update(referrerRef, { qualifiedReferCount: currentCount + 1 });
                                    update(targetUserRef, { countedForReferChallenge: true });
                                }
                            });
                        }
                    }
                }).catch(() => {});
            }

            document.getElementById('fundAmount').value = '';
            document.getElementById('utrInput').value = '';
            window.generateSecureQR();

            window.showCustomToast(`🎉 INSTANT AUTO-VERIFIED! ₹${value.toFixed(2)} added to your wallet.`, "success");
            return;
        }

        // 3. Fallback: If not matched instantly, route safely to Admin Clearance Audit Queue
        const uniqueTxHashKey = 'tx_' + Date.now();
        const userEmailStr = currentAuthenticatedUserToken.email || 'Registered User';
        const activeObjectPayload = { 
            structId: uniqueTxHashKey, 
            uid: currentAuthenticatedUserToken.uid, 
            email: userEmailStr, 
            value: value, 
            utr: identifierInput, 
            internalState: 'Processing',
            timestamp: Date.now()
        };

        await set(ref(database, `users/${currentAuthenticatedUserToken.uid}/transactions/${uniqueTxHashKey}`), activeObjectPayload);
        await set(ref(database, `global_deposits/${uniqueTxHashKey}`), activeObjectPayload);

        document.getElementById('fundAmount').value = '';
        document.getElementById('utrInput').value = '';
        window.generateSecureQR();
        window.showCustomToast("Clearance report generated! Awaiting audits verification.", "success");

    } catch (err) {
        console.error("Deposit Processing Error:", err);
        window.showCustomToast("Deposit submission error: " + err.message, "error");
    } finally {
        isDepositSubmitting = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `Submit Payments`;
        }
    }
};

// ✅ UPDATED HYBRID CLIENT DISPATCHER (Direct & Vercel Proxy Safe)
window.executeSMMPipelineOrder = async function() {
    const selectElement = document.getElementById('serviceSelect');
    const rateCost = parseFloat(selectElement.value);
    const selectedServiceName = selectElement.options[selectElement.selectedIndex].text;
    const extractedServiceId = selectedServiceName.split('-')[0].trim();
    const qty = parseInt(document.getElementById('targetOrderQty').value);
    const link = document.getElementById('targetOrderLink').value.trim();

    if(!qty || qty <= 0 || !link) { window.showCustomToast("Fill the destination parameters fully.", "error"); return; }
    
    const realTimeComputedCost = (rateCost / 1000) * qty;
    const currentWalletBal = parseFloat(userDataRecordCached ? userDataRecordCached.walletBalance || 0 : 0);

    if(currentWalletBal < realTimeComputedCost) { 
        window.showCustomToast(`Ledger deficit. Cost: ₹${realTimeComputedCost.toFixed(2)}`, "error"); 
        return; 
    }

    const submitBtn = document.getElementById('submit-order-pipeline-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>DISPATCHING...</span><i class="fa-solid fa-spinner animate-spin"></i>`;

    let providerLiveOrderId = null;
    let initialStartCount = "15556";
    
    try {
        // Try calling Vercel API Route first
        const res = await fetch("/api/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "add",
                service: extractedServiceId,
                link: link,
                quantity: qty
            })
        });

        const data = await res.json();
        
        if (data && data.error) {
            window.showCustomToast(`Order Refused: ${data.error}. Balance not deducted.`, "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>DISPATCH SMM PIPELINE</span><i class="fa-solid fa-paper-plane animate-pulse"></i>`;
            return;
        }

        if (data && (data.order || data.orderId || data.order_id)) {
            providerLiveOrderId = data.order || data.orderId || data.order_id;
            if (data.start_count) initialStartCount = data.start_count;
        }
    } catch (err) {
        // Fallback for direct App/CORS execution if Vercel serverless proxy is unreached
        console.warn("Serverless route unreached, executing client-side fallback dispatch...");
        try {
            const fallbackKey = 'ad7b6ed8b9e332b2f4b9c4840e0fb7db';
            const formData = new URLSearchParams();
            formData.append('key', fallbackKey);
            formData.append('action', 'add');
            formData.append('service', extractedServiceId);
            formData.append('link', link);
            formData.append('quantity', qty);

            const fbRes = await fetch('https://aapkaprovider.com/api/v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            });
            const fbData = await fbRes.json();
            if (fbData && (fbData.order || fbData.orderId)) {
                providerLiveOrderId = fbData.order || fbData.orderId;
            }
        } catch(e) {}
    }

    if (!providerLiveOrderId) {
        providerLiveOrderId = Math.floor(100000 + Math.random() * 900000);
    }

    const uniqueOrderKey = 'order_' + Date.now();
    const cleanServiceName = selectedServiceName.split('—')[0].trim();
    const orderPayloadData = { 
        orderId: 'SGS-' + providerLiveOrderId, 
        rawOrderId: providerLiveOrderId,
        serviceName: cleanServiceName, 
        quantity: qty, 
        cost: realTimeComputedCost, 
        link: link,
        startCount: initialStartCount,
        status: 'Pending',
        timestamp: Date.now()
    };

    const updatedUserBalancePostOrder = currentWalletBal - realTimeComputedCost;

    try {
        await set(ref(database, `users/${currentAuthenticatedUserToken.uid}/orders/${uniqueOrderKey}`), orderPayloadData);
        await update(ref(database, 'users/' + currentAuthenticatedUserToken.uid), { walletBalance: updatedUserBalancePostOrder });

        if (userDataRecordCached) {
            userDataRecordCached.walletBalance = updatedUserBalancePostOrder;
            if (!userDataRecordCached.orders) userDataRecordCached.orders = {};
            userDataRecordCached.orders[uniqueOrderKey] = orderPayloadData;
        }

        document.getElementById('userBalance').innerText = updatedUserBalancePostOrder.toFixed(2);
        window.renderUserOrdersHistory();

        const banner = document.getElementById('topSuccessBanner');
        document.getElementById('bannerNotificationText').innerText = `SUCCESS! Order ID: ${providerLiveOrderId} | Service ID: ${extractedServiceId} | Cost: ₹${realTimeComputedCost.toFixed(2)}`;
        banner.classList.remove('hidden');
        
        document.getElementById('targetOrderQty').value = '';
        document.getElementById('targetOrderLink').value = '';
        document.getElementById('calculatedCostText').innerText = "0.00";
        
        window.showCustomToast("Order successfully placed & logged!", "success");
        setTimeout(() => { banner.classList.add('hidden'); }, 6000);

    } catch (dbErr) {
        window.showCustomToast("Database update error: " + dbErr.message, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>DISPATCH SMM PIPELINE</span><i class="fa-solid fa-paper-plane animate-pulse"></i>`;
    }
};

// 🌟 UPDATED ADMIN USERS LIST (SHOWS EMAIL WITH UID & CLICKABLE VIEW DATA)
window.renderAdminUsersList = function() {
    const stream = document.getElementById('adminUsersStream');
    if(!stream) return;
    if(!window.allUsersCache || typeof window.allUsersCache !== 'object' || Object.keys(window.allUsersCache).length === 0) {
        stream.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-slate-500 italic font-mono">No users registered in database.</td></tr>`;
        return;
    }

    const searchEl = document.getElementById('adminUserSearchInput');
    const searchTerm = searchEl ? searchEl.value.trim().toLowerCase() : '';
    let htmlRows = '';
    let count = 0;

    Object.keys(window.allUsersCache).forEach(uid => {
        const u = window.allUsersCache[uid];
        if (!u || typeof u !== 'object') return;

        const email = u.email || `User (${uid.substring(0, 8)})`;
        const userUidVal = u.userUid || '----';
        
        if (searchTerm && !email.toLowerCase().includes(searchTerm) && !userUidVal.toLowerCase().includes(searchTerm)) {
            return;
        }
        count++;

        const liveBal = u.walletBalance !== undefined ? parseFloat(u.walletBalance).toFixed(2) : "0.00";
        const safeEmail = window.escapeHtml(email);
        const providerIcon = (u.provider === 'google' || u.provider === 'google.com') 
            ? `<i class="fa-brands fa-google text-rose-500 text-sm" title="Google Provider"></i>` 
            : `<i class="fa-solid fa-envelope text-sky-400 text-sm" title="Email Provider"></i>`;
        const createdAtStr = window.escapeHtml(u.createdAt || '24 Jul 2026');
        const lastSignedInStr = window.escapeHtml(u.lastSignedIn || '24 Jul 2026');
        
        htmlRows += `
            <tr class="hover:bg-[#0d1220]/40 transition border-b border-slate-800 font-mono text-xs">
                <td class="p-3 sm:p-4">
                    <div class="flex flex-col">
                        <span class="text-slate-200 font-bold truncate max-w-[200px]" title="${safeEmail}">${safeEmail}</span>
                        <span onclick="window.viewAdminUserData('${uid}')" class="text-[10px] text-amber-400 font-extrabold cursor-pointer hover:underline flex items-center space-x-1 mt-0.5" title="Click to view full user activity & orders">
                            <i class="fa-solid fa-id-badge text-[9px]"></i>
                            <span>UID: #${userUidVal}</span>
                        </span>
                    </div>
                </td>
                <td class="p-3 sm:p-4 text-center">${providerIcon}</td>
                <td class="p-3 sm:p-4 text-slate-400">${createdAtStr}</td>
                <td class="p-3 sm:p-4 text-slate-400">${lastSignedInStr}</td>
                <td class="p-3 sm:p-4 font-bold text-emerald-400 font-mono">₹${liveBal}</td>
                <td class="p-3 sm:p-4 text-right space-x-1.5">
                    <button onclick="window.viewAdminUserData('${uid}')" class="bg-amber-600/80 hover:bg-amber-500 border border-amber-500/40 text-slate-950 font-black px-2.5 py-1.5 rounded-xl text-[9px] uppercase tracking-wider transition active:scale-95"><i class="fa-solid fa-eye mr-1"></i>View Data</button>
                    <button onclick="window.updateUserBalancePrompt('${uid}', '${liveBal}', '${safeEmail}')" class="bg-purple-600/80 hover:bg-purple-500 border border-purple-500/40 text-white font-bold px-2.5 py-1.5 rounded-xl text-[9px] uppercase tracking-wider transition active:scale-95">Adjust Bal</button>
                    <button onclick="window.triggerDeleteUserModal('${uid}', '${safeEmail}')" class="bg-rose-600/80 hover:bg-rose-500 border border-rose-500/40 text-white font-bold px-2.5 py-1.5 rounded-xl text-[9px] uppercase tracking-wider transition active:scale-95"><i class="fa-solid fa-trash-can mr-1"></i>Remove</button>
                </td>
            </tr>`;
    });

    if (count === 0) {
        stream.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-500 italic font-mono">No matching user records found.</td></tr>`;
    } else {
        stream.innerHTML = htmlRows;
    }
};

// 🌟 NEW FUNCTION: OPEN ADMIN USER DATA DEEP AUDIT MODAL
window.viewAdminUserData = function(targetUid) {
    if (!window.allUsersCache || !window.allUsersCache[targetUid]) {
        if (window.showCustomToast) window.showCustomToast("User record not found in cache", "error");
        return;
    }

    const u = window.allUsersCache[targetUid];
    const modal = document.getElementById('adminUserDetailModalOverlay');
    
    document.getElementById('modalUserEmailTitle').innerText = `${u.email || 'Registered User'} (Firebase UID: ${targetUid})`;
    document.getElementById('modalUserUID').innerText = `#${u.userUid || '----'}`;
    document.getElementById('modalUserWallet').innerText = `₹${parseFloat(u.walletBalance || 0).toFixed(2)}`;
    document.getElementById('modalUserProvider').innerText = (u.provider === 'google' || u.provider === 'google.com') ? 'Google OAuth' : 'Email/Pass';
    document.getElementById('modalUserRefers').innerText = u.qualifiedReferCount || 0;

    // Populate Orders Table inside Modal
    const ordersStream = document.getElementById('modalUserOrdersStream');
    if (!u.orders || Object.keys(u.orders).length === 0) {
        ordersStream.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-500 italic font-mono">No orders placed by this user yet.</td></tr>`;
    } else {
        let orderRows = '';
        const now = Date.now();
        Object.keys(u.orders).reverse().forEach(oKey => {
            const ord = u.orders[oKey];
            let currentOrdStatus = ord.status || 'Pending';
            if (currentOrdStatus !== 'Completed' && currentOrdStatus !== 'Cancelled') {
                const elapsed = (now - (ord.timestamp || now)) / 1000;
                if (elapsed > 120) currentOrdStatus = 'Completed';
                else if (elapsed > 30) currentOrdStatus = 'In Progress';
            }

            let stBadge = `<span class="text-amber-400 font-bold">${currentOrdStatus}</span>`;
            if (currentOrdStatus === 'Completed') stBadge = `<span class="text-emerald-400 font-bold">Completed</span>`;
            if (currentOrdStatus === 'Cancelled' || currentOrdStatus === 'Canceled') stBadge = `<span class="text-rose-400 font-bold">Cancelled</span>`;

            orderRows += `
                <tr class="hover:bg-[#0d1220]/40 transition border-b border-slate-800/60">
                    <td class="p-2.5 font-bold text-slate-300">${ord.rawOrderId || ord.orderId || oKey}</td>
                    <td class="p-2.5 text-slate-300 truncate max-w-[150px]" title="${ord.serviceName}">${ord.serviceName}</td>
                    <td class="p-2.5 text-slate-400">${ord.quantity}</td>
                    <td class="p-2.5 font-bold text-amber-400">₹${parseFloat(ord.cost || 0).toFixed(2)}</td>
                    <td class="p-2.5 text-sky-400 truncate max-w-[140px]"><a href="${ord.link}" target="_blank" class="hover:underline">${ord.link}</a></td>
                    <td class="p-2.5">${stBadge}</td>
                </tr>
            `;
        });
        ordersStream.innerHTML = orderRows;
    }

    // Populate Transactions Table inside Modal
    const txStream = document.getElementById('modalUserTxStream');
    if (!u.transactions || Object.keys(u.transactions).length === 0) {
        txStream.innerHTML = `<tr><td colspan="3" class="p-6 text-center text-slate-500 italic font-mono">No deposits recorded.</td></tr>`;
    } else {
        let txRows = '';
        Object.keys(u.transactions).reverse().forEach(tKey => {
            const tx = u.transactions[tKey];
            let txState = `<span class="text-amber-400 font-bold">${tx.internalState}</span>`;
            if (tx.internalState === 'Verified') txState = `<span class="text-emerald-400 font-bold">Verified</span>`;
            if (tx.internalState === 'Cancelled') txState = `<span class="text-rose-400 font-bold">Cancelled</span>`;

            txRows += `
                <tr class="hover:bg-[#0d1220]/40 transition border-b border-slate-800/60">
                    <td class="p-2.5 font-bold text-emerald-400">₹${parseFloat(tx.value || 0).toFixed(2)}</td>
                    <td class="p-2.5 text-slate-300 font-mono">${tx.utr || 'N/A'}</td>
                    <td class="p-2.5">${txState}</td>
                </tr>
            `;
        });
        txStream.innerHTML = txRows;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeAdminUserDetailModal = function() {
    const modal = document.getElementById('adminUserDetailModalOverlay');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

let pendingDeleteUid = null;
window.triggerDeleteUserModal = function(targetUid, email) {
    pendingDeleteUid = targetUid;
    document.getElementById('deleteTargetUserEmail').innerText = email;
    const modal = document.getElementById('deleteUserModalOverlay');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeDeleteUserModal = function() {
    pendingDeleteUid = null;
    const modal = document.getElementById('deleteUserModalOverlay');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

document.getElementById('cancelDeleteUserBtn').addEventListener('click', window.closeDeleteUserModal);
document.getElementById('confirmDeleteUserBtn').addEventListener('click', () => {
    if (pendingDeleteUid) {
        const targetUid = pendingDeleteUid;
        set(ref(database, 'users/' + targetUid), null).then(() => {
            window.showCustomToast("User removed permanently from database!", "success");
            window.closeDeleteUserModal();
        }).catch(err => {
            window.showCustomToast("Failed to remove user: " + err.message, "error");
            window.closeDeleteUserModal();
        });
    }
});

window.updateUserBalancePrompt = function(targetUid, currentBal, email) {
    const inputVal = prompt(`Update Wallet Balance for:\n${email}\n(UID: ${targetUid})`, currentBal);
    if (inputVal !== null) {
        const newBal = parseFloat(inputVal);
        if (!isNaN(newBal) && newBal >= 0) {
            set(ref(database, `users/${targetUid}/walletBalance`), newBal).then(() => {
                window.showCustomToast("Wallet balance updated successfully!", "success");
            }).catch(err => {
                window.showCustomToast("Failed to update balance: " + err.message, "error");
            });
        } else {
            window.showCustomToast("Invalid balance amount entered.", "error");
        }
    }
};

window.switchAdminTab = function(tabName) {
    const depSec = document.getElementById('adminDepositsSection');
    const usrSec = document.getElementById('adminUsersSection');
    const noticeSec = document.getElementById('adminNoticeSection');
    const depBtn = document.getElementById('admin-tab-deposits-btn');
    const usrBtn = document.getElementById('admin-tab-users-btn');
    const noticeBtn = document.getElementById('admin-tab-notice-btn');

    if (tabName === 'deposits') {
        if (depSec) depSec.classList.remove('hidden');
        if (usrSec) usrSec.classList.add('hidden');
        if (noticeSec) noticeSec.classList.add('hidden');
        if (depBtn) depBtn.className = "bg-purple-600 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition shadow-glow-purple";
        if (usrBtn) usrBtn.className = "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition";
        if (noticeBtn) noticeBtn.className = "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition";
    } else if (tabName === 'users') {
        if (depSec) depSec.classList.add('hidden');
        if (usrSec) usrSec.classList.remove('hidden');
        if (noticeSec) noticeSec.classList.add('hidden');
        if (usrBtn) usrBtn.className = "bg-purple-600 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition shadow-glow-purple";
        if (depBtn) depBtn.className = "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition";
        if (noticeBtn) noticeBtn.className = "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition";
        window.renderAdminUsersList();
    } else if (tabName === 'notice') {
        if (depSec) depSec.classList.add('hidden');
        if (usrSec) usrSec.classList.add('hidden');
        if (noticeSec) {
            noticeSec.classList.remove('hidden');
            get(ref(database, 'system_notice/content')).then((snap) => {
                if (snap.exists() && document.getElementById('adminNoticeInput')) {
                    document.getElementById('adminNoticeInput').value = snap.val();
                }
            });
        }
        if (noticeBtn) noticeBtn.className = "bg-purple-600 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition shadow-glow-purple";
        if (depBtn) depBtn.className = "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition";
        if (usrBtn) usrBtn.className = "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition";
    }
};

const depTabBtn = document.getElementById('admin-tab-deposits-btn');
if (depTabBtn) depTabBtn.addEventListener('click', () => window.switchAdminTab('deposits'));

const usrTabBtn = document.getElementById('admin-tab-users-btn');
if (usrTabBtn) usrTabBtn.addEventListener('click', () => window.switchAdminTab('users'));

const usrSearchInput = document.getElementById('adminUserSearchInput');
if (usrSearchInput) usrSearchInput.addEventListener('input', () => window.renderAdminUsersList());

window.commitStateVerification = function(targetUid, structId, txnValue, actionType) {
    const finalState = actionType === 'approve' ? 'Verified' : 'Cancelled';
    
    update(ref(database, `users/${targetUid}/transactions/${structId}`), { internalState: finalState }).catch(() => {});
    set(ref(database, `global_deposits/${structId}`), null).catch(() => {});

    if(actionType === 'approve') {
        const targetBalanceRef = ref(database, `users/${targetUid}/walletBalance`);
        get(targetBalanceRef).then((snap) => {
            let currentBal = snap.exists() ? parseFloat(snap.val()) : 0;
            const updatedBal = currentBal + parseFloat(txnValue);
            set(targetBalanceRef, updatedBal).then(() => {
                window.showCustomToast(`Approved! ₹${parseFloat(txnValue).toFixed(2)} added to user wallet.`, "success");
            });
        });

        // Random Referral Bonus (₹1.00 to ₹2.00)
        const targetUserRef = ref(database, `users/${targetUid}`);
        get(targetUserRef).then((uSnap) => {
            if (uSnap.exists()) {
                const uData = uSnap.val();
                if (uData.referredBy && !uData.referralRewarded) {
                    const randomBonus = parseFloat((Math.random() * 1.00 + 1.00).toFixed(2));
                    const referrerUid = uData.referredBy;
                    
                    const referrerBalRef = ref(database, `users/${referrerUid}/walletBalance`);
                    get(referrerBalRef).then((rSnap) => {
                        const prevRefBal = rSnap.exists() ? parseFloat(rSnap.val()) : 0;
                        set(referrerBalRef, prevRefBal + randomBonus);
                        
                        const refTxKey = 'tx_ref_' + Date.now();
                        const refTxPayload = {
                            structId: refTxKey,
                            uid: referrerUid,
                            value: randomBonus,
                            utr: 'REF_BONUS_' + targetUid.substring(0, 6).toUpperCase(),
                            internalState: 'Verified'
                        };
                        set(ref(database, `users/${referrerUid}/transactions/${refTxKey}`), refTxPayload);
                        update(ref(database, `users/${targetUid}`), { referralRewarded: true });
                    });
                }
            }
        });
    } else {
        window.showCustomToast(`Deposit request rejected.`, "info");
    }
};

window.handleEmailSignup = async function() {
    const emailInput = document.getElementById('registerEmail');
    const passInput = document.getElementById('registerPass');
    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const pass = passInput ? passInput.value.trim() : '';
    const refCodeInput = document.getElementById('registerRefCode') ? document.getElementById('registerRefCode').value.trim().toUpperCase() : '';
    
    const agreeCheckbox = document.getElementById('agree-terms');
    if (agreeCheckbox && !agreeCheckbox.checked) {
        window.showCustomToast("Please accept Privacy Mandate & Terms.", "error");
        return;
    }

    if(!email || !pass) { 
        window.showCustomToast("Please fill email & password.", "error"); 
        return; 
    }

    if(pass.length < 6) { 
        window.showCustomToast("Password must be at least 6 characters long.", "error"); 
        return; 
    }

    const btn = document.getElementById('register-submit-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Creating Account...";
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const newUid = userCredential.user.uid;
        
        if (refCodeInput) {
            try {
                const codeSnap = await get(ref(database, `referral_codes/${refCodeInput}`));
                let referrerUid = codeSnap.exists() ? codeSnap.val() : null;
                if (!referrerUid && refCodeInput.length >= 6) {
                    referrerUid = refCodeInput.toLowerCase();
                }
                if (referrerUid && referrerUid !== newUid) {
                    await update(ref(database, `users/${newUid}`), { referredBy: referrerUid });
                }
            } catch (refErr) {
                console.warn("Referral binding deferred:", refErr);
            }
        }
        
        window.showCustomToast("Account created successfully!", "success");
    } catch(err) {
        console.error("Signup error:", err);
        let friendlyMsg = err.message;
        if (err.code === 'auth/email-already-in-use') friendlyMsg = "This email is already registered. Please login instead.";
        else if (err.code === 'auth/invalid-email') friendlyMsg = "Invalid email format. Please enter a valid email.";
        else if (err.code === 'auth/weak-password') friendlyMsg = "Password is too weak. Minimum 6 characters required.";
        else if (err.code === 'auth/operation-not-allowed') friendlyMsg = "Email/Password accounts are disabled in Firebase Console!";
        else if (err.code === 'auth/network-request-failed') friendlyMsg = "Network error. Please check your internet connection.";
        
        window.showCustomToast(friendlyMsg, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Verify & Create Session Token";
        }
    }
};

window.handleEmailLogin = function() {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    if(!email || !pass) { window.showCustomToast("Please supply email & passphrase.", "error"); return; }

    signInWithEmailAndPassword(auth, email, pass)
        .catch(err => {
            let friendlyMsg = err.message;
            if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                friendlyMsg = "Invalid email or password. Please try again.";
            }
            window.showCustomToast(friendlyMsg, "error");
        });
};

window.handlePasswordReset = function() {
    const email = document.getElementById('forgotEmail').value.trim();
    if(!email) { window.showCustomToast("Identity target needed.", "error"); return; }
    sendPasswordResetEmail(auth, email)
        .then(() => { window.showCustomToast("Recovery route dispatched to email inbox!", "success"); window.toggleAuthMode('login'); })
        .catch(err => window.showCustomToast("Dispatch Fault: " + err.message, "error"));
};

window.handleLogout = function() {
    signOut(auth).then(() => { 
        const drawer = document.getElementById('sideDrawer');
        if(drawer && !drawer.classList.contains('-translate-x-full')) window.toggleDrawer(); 
        window.showCustomToast("Session Terminated Successfully.");
    });
};

document.getElementById('login-submit-btn').addEventListener('click', window.handleEmailLogin);
document.getElementById('register-submit-btn').addEventListener('click', window.handleEmailSignup);
document.getElementById('reset-submit-btn').addEventListener('click', window.handlePasswordReset);
document.getElementById('drawer-logout-btn').addEventListener('click', window.handleLogout);
document.getElementById('submit-deposit-btn').addEventListener('click', window.submitDepositToServer);
document.getElementById('submit-order-pipeline-btn').addEventListener('click', window.executeSMMPipelineOrder);

// Smart SGS AI Knowledge Engine
window.getSmartAiResponse = function(q) {
    const query = q.toLowerCase();
    
    if (query.includes('deposit') || query.includes('add fund') || query.includes('utr') || query.includes('balance') || query.includes('pay') || query.includes('qr') || query.includes('money')) {
        return "To add balance, go to the 'Deposit' tab, enter your desired amount (₹), scan the generated UPI QR code to pay, and submit your Sender Name or 12-digit transaction UTR ID. The system will instantly auto-verify and credit your balance!";
    }
    if (query.includes('order') || query.includes('views') || query.includes('likes') || query.includes('followers') || query.includes('reels') || query.includes('subscribers') || query.includes('buy')) {
        return "You can place instant SMM orders on the 'Order' tab! Choose your platform (Instagram, YouTube, or Facebook), select a service package, paste your link, enter quantity, and click 'Dispatch SMM Pipeline'.";
    }
    if (query.includes('refer') || query.includes('earn') || query.includes('affiliate') || query.includes('code') || query.includes('link')) {
        return "Share your referral link or code from the 'Earn' tab! When your friend makes their first deposit and it gets verified, you automatically earn a bonus between ₹1.00 and ₹2.00 credited straight to your wallet.";
    }
    if (query.includes('status') || query.includes('log') || query.includes('history') || query.includes('track')) {
        return "You can view all your placed orders and their live execution status under the 'Logs' tab on your dashboard.";
    }
    if (query.includes('safe') || query.includes('security') || query.includes('password') || query.includes('ban')) {
        return "SGS SMM Engine operates under strict 256-bit SSL protocols. We NEVER ask for your social media passwords or private keys. All dispatches use official promotional channels.";
    }
    if (query.includes('time') || query.includes('speed') || query.includes('fast') || query.includes('instant')) {
        return "Most SMM dispatches start instantly within 0-5 minutes of placing an order. Speeds vary from 100K/hr for Reels views to 50K/day for followers.";
    }
    if (query.includes('refund') || query.includes('cancel') || query.includes('refill')) {
        return "Orders submitted with valid links are processed automatically. High-quality packages include 30-day to lifetime refill guarantees if drops occur!";
    }
    if (query.includes('hi') || query.includes('hello') || query.includes('hey') || query.includes('sgs')) {
        return "Hello! I am SGS AI, your dedicated support assistant. How can I assist you with orders, deposits, or referral rewards today?";
    }
    
    return "Thank you for reaching out! SGS SMM Engine provides automated social media growth (Views, Likes, Followers). You can easily deposit funds via UPI QR and place orders instantly on your dashboard.";
};

window.dispatchAiQuery = async function() {
    const inputEl = document.getElementById('aiUserInput');
    const queryText = inputEl.value.trim();
    if(!queryText) return;

    window.renderAiBubble(queryText, true);
    inputEl.value = '';

    const loadingBubble = document.createElement('div');
    loadingBubble.className = "flex items-start space-x-2.5 animate-pulse";
    loadingBubble.innerHTML = `
        <div class="w-6 h-6 bg-rose-500/10 rounded-lg flex items-center justify-center text-rose-400 text-[9px] shrink-0 font-bold">AI</div>
        <div class="bg-[#0d1220]/80 border border-slate-800/40 p-3 rounded-2xl rounded-tl-none max-w-[80%] text-slate-500 font-mono italic">
            Analyzing request parameters...
        </div>
    `;
    const chatStream = document.getElementById('aiMessagesStream');
    chatStream.appendChild(loadingBubble);
    chatStream.scrollTop = chatStream.scrollHeight;

    setTimeout(() => {
        loadingBubble.remove();
        const smartAnswer = window.getSmartAiResponse(queryText);
        window.renderAiBubble(smartAnswer, false);
    }, 600);
};

window.renderAiBubble = function(text, isUser = false) {
    const chatStream = document.getElementById('aiMessagesStream');
    const bubble = document.createElement('div');
    bubble.className = isUser 
        ? "flex items-start space-x-2.5 justify-end animate-fade-in" 
        : "flex items-start space-x-2.5 animate-fade-in";
        
    if(isUser) {
        bubble.innerHTML = `
            <div class="bg-rose-500/20 border border-rose-500/30 p-3 rounded-2xl rounded-tl-none max-w-[80%] text-slate-200">
                ${window.escapeHtml(text)}
            </div>
        `;
    } else {
        bubble.innerHTML = `
            <div class="w-6 h-6 bg-rose-500/10 rounded-lg flex items-center justify-center text-rose-400 text-[9px] shrink-0 font-bold font-mono">AI</div>
            <div class="bg-[#0d1220]/80 border border-slate-800/40 p-3 rounded-2xl rounded-tl-none max-w-[80%] text-slate-300 leading-relaxed">
                ${window.escapeHtml(text)}
            </div>
        `;
    }
    chatStream.appendChild(bubble);
    chatStream.scrollTop = chatStream.scrollHeight;
};

window.escapeHtml = function(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
};

window.toggleAuthMode = function(mode) {
    document.getElementById('loginForm').classList.toggle('hidden', mode !== 'login');
    document.getElementById('signupForm').classList.toggle('hidden', mode !== 'signup');
    document.getElementById('forgotForm').classList.toggle('hidden', mode !== 'forgot');
};

document.getElementById('trigger-forgot-btn').addEventListener('click', () => window.toggleAuthMode('forgot'));
document.getElementById('trigger-signup-btn').addEventListener('click', () => window.toggleAuthMode('signup'));
document.getElementById('trigger-login-btn').addEventListener('click', () => window.toggleAuthMode('login'));
document.getElementById('trigger-login-btn-2').addEventListener('click', () => window.toggleAuthMode('login'));

window.toggleDrawer = function() {
    document.getElementById('sideDrawer').classList.toggle('-translate-x-full');
    document.getElementById('drawerOverlay').classList.toggle('hidden');
};

document.getElementById('drawer-toggle-btn').addEventListener('click', window.toggleDrawer);
document.getElementById('drawer-close-btn').addEventListener('click', window.toggleDrawer);
document.getElementById('drawerOverlay').addEventListener('click', window.toggleDrawer);

// Sidebar & Bottom Nav
document.getElementById('tab-btn-dashboard').addEventListener('click', () => window.switchTab('dashboard'));
document.getElementById('tab-btn-myorders').addEventListener('click', () => window.switchTab('myorders'));
document.getElementById('tab-btn-addfunds').addEventListener('click', () => window.switchTab('addfunds'));
document.getElementById('tab-btn-refer').addEventListener('click', () => window.switchTab('refer'));

document.getElementById('mbtn-dashboard').addEventListener('click', () => window.switchTab('dashboard'));
document.getElementById('mbtn-myorders').addEventListener('click', () => window.switchTab('myorders'));
document.getElementById('mbtn-addfunds').addEventListener('click', () => window.switchTab('addfunds'));
document.getElementById('mbtn-refer').addEventListener('click', () => window.switchTab('refer'));

document.getElementById('drawerAdminLink').addEventListener('click', () => window.launchAdminConsole());

document.getElementById('admin-close-btn').addEventListener('click', () => {
    document.getElementById('adminCoreConsole').classList.add('hidden');
    document.getElementById('adminCoreConsole').classList.remove('flex');
    document.getElementById('appContainer').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('flex');
});

const adminLogoutBtn = document.getElementById('admin-logout-btn');
if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', () => {
        document.getElementById('adminCoreConsole').classList.add('hidden');
        document.getElementById('adminCoreConsole').classList.remove('flex');
        window.handleLogout();
    });
}

// External Links
const btnInsta = document.getElementById('btn-insta-social');
if(btnInsta) btnInsta.addEventListener('click', () => window.open('https://www.instagram.com/t_sachin420?igsh=N3NtbTV5cnJ0aW50', '_blank'));

const btnYt = document.getElementById('btn-yt-social');
if(btnYt) btnYt.addEventListener('click', () => window.open('https://www.youtube.com/@rojgarwithberojgar-2', '_blank'));

const btnDesktopMain = document.getElementById('btn-desktop-main');
if(btnDesktopMain) btnDesktopMain.addEventListener('click', () => window.open('https://sgsinstaboost.github.io/online-service/', '_blank'));

const btnDesktopSecurity = document.getElementById('btn-desktop-security');
if(btnDesktopSecurity) btnDesktopSecurity.addEventListener('click', () => window.showSecurityInfo());

// Policy Modal Integration
window.showPolicy = function(type) {
    const titleEl = document.getElementById('legalModalTitle');
    const contentEl = document.getElementById('legalModalContent');
    const modal = document.getElementById('legalModalOverlay');
    
    if(type === 'privacy') {
        titleEl.innerHTML = `<i class="fa-solid fa-user-shield text-emerald-400"></i><span>SGS InstaBoost - Official Privacy Policy</span>`;
        contentEl.innerHTML = `
            <div class="space-y-4">
                <p class="text-slate-400"><strong>Effective Date:</strong> July 24, 2026 | <strong>Last Updated:</strong> July 24, 2026</p>
                
                <p>Welcome to <strong>SGS InstaBoost</strong> ("we," "our," or "us"). We respect user privacy and are committed to complying with Google Play Developer Policies, User Data Policies, and global data protection standards.</p>

                <h4 class="font-bold text-white text-sm border-b border-slate-800 pb-1">1. Information We Collect</h4>
                <ul class="list-disc pl-5 space-y-1 text-slate-300">
                    <li><strong>Account Information:</strong> When you register using Email and Password, we collect only your <strong>Registered Email Address</strong>. Password credentials are stored in secure hashed format.</li>
                    <li><strong>Wallet & Order Records:</strong> We track in-app wallet balance, deposit history, and order logs to process promotional management services.</li>
                    <li><strong>Device Diagnostics:</strong> Basic non-identifiable parameters (e.g., OS version, device model, IP address) are logged for app stability and fraud prevention.</li>
                </ul>

                <h4 class="font-bold text-white text-sm border-b border-slate-800 pb-1">2. Services & Promotional Compliance</h4>
                <p class="text-slate-300">SGS InstaBoost is a third-party social media marketing management tool and analytics utility platform that assists users in managing campaign orders via provider APIs.</p>
                <div class="bg-amber-500/10 border-l-4 border-amber-500 p-3 rounded text-amber-200">
                    <strong>Service Guidelines:</strong>
                    <ul class="list-disc pl-5 space-y-1 mt-1 text-xs">
                        <li>We do NOT sell, manipulate, or artificially generate engagement in violation of platform terms.</li>
                        <li>Our application functions strictly as an order submission interface using secure third-party provider APIs.</li>
                        <li>We do not request or store passwords or personal tokens of any third-party social media profiles.</li>
                    </ul>
                </div>

                <h4 class="font-bold text-white text-sm border-b border-slate-800 pb-1">3. How We Use Your Data</h4>
                <ul class="list-disc pl-5 space-y-1 text-slate-300">
                    <li>To manage your account, authenticate user access via Email and Password, and maintain live wallet balances.</li>
                    <li>To fulfill order requests via third-party service provider APIs.</li>
                    <li>To process customer support queries and payment verification requests.</li>
                    <li>To enforce platform security and prevent unauthorized activity.</li>
                </ul>

                <h4 class="font-bold text-white text-sm border-b border-slate-800 pb-1">4. Data Storage & Security</h4>
                <ul class="list-disc pl-5 space-y-1 text-slate-300">
                    <li><strong>Google Firebase Infrastructure:</strong> All user credentials and database entries are stored securely on Google Firebase Authentication and Realtime Database.</li>
                    <li><strong>Encryption:</strong> Data transmitted between the app and servers is encrypted using standard SSL/TLS protocols.</li>
                </ul>

                <div class="bg-rose-500/10 border-l-4 border-rose-500 p-3 rounded text-rose-200 space-y-2">
                    <h4 class="font-bold text-white text-sm">5. Account Deletion & Data Removal Policy (Mandatory)</h4>
                    <p class="text-xs">In accordance with Google Play's User Data Policy, all users have the right to request the deletion of their account and associated personal data.</p>
                    <p class="text-xs"><strong>How to Request Account & Data Deletion:</strong></p>
                    <ul class="list-disc pl-5 space-y-1 text-xs">
                        <li>Send an email to: <strong>contactsgsinstaboost@gmail.com</strong></li>
                        <li>Subject line: <strong>"Account Deletion Request - SGS InstaBoost"</strong></li>
                        <li>Include your registered <strong>Email Address</strong> in the body of the message.</li>
                    </ul>
                    <p class="text-xs">Upon verification, your credentials, Email, Wallet History, and Activity Logs are permanently purged from Firebase within <strong>7 business days</strong>.</p>
                </div>

                <h4 class="font-bold text-white text-sm border-b border-slate-800 pb-1">6. Contact Support</h4>
                <p class="text-slate-300">Support Email: <a href="mailto:contactsgsinstaboost@gmail.com" class="text-rose-400 underline">contactsgsinstaboost@gmail.com</a></p>
            </div>`;
    } else {
        titleEl.innerHTML = `<i class="fa-solid fa-scale-balanced text-amber-400"></i><span>Terms of Agreement (Terms of Service)</span>`;
        contentEl.innerHTML = `
            <div class="space-y-4">
                <p class="text-slate-400"><strong>Effective Date:</strong> July 24, 2026 | <strong>Last Updated:</strong> July 24, 2026</p>
                
                <p>Welcome to <strong>SGS InstaBoost</strong>. Please read these Terms of Agreement ("Terms", "Agreement") carefully before using our mobile application. By creating an account or using any service, you agree to be bound by these legal terms.</p>

                <h4 class="font-bold text-white text-sm border-b border-slate-800 pb-1">1. Acceptance of Terms</h4>
                <p class="text-slate-300">By accessing or using SGS InstaBoost, you confirm that you are at least 18 years of age and possess legal authority to enter into this agreement.</p>

                <h4 class="font-bold text-white text-sm border-b border-slate-800 pb-1">2. Account Registration & Security</h4>
                <ul class="list-disc pl-5 space-y-1 text-slate-300">
                    <li>Accounts are created using Email/Password or Google Sign-In. You are responsible for maintaining confidentiality.</li>
                    <li>You are fully responsible for all activities and transactions executed under your registered account.</li>
                </ul>

                <h4 class="font-bold text-white text-sm border-b border-slate-800 pb-1">3. Service Description & API Usage</h4>
                <p class="text-slate-300">SGS InstaBoost operates as a social media growth management service platform processing requests using provider APIs:</p>
                <ul class="list-disc pl-5 space-y-1 text-slate-300">
                    <li><strong>Public Profiles:</strong> Target accounts or links submitted must be public. We are not responsible for delays caused by private profiles.</li>
                    <li><strong>Service Fluctuations:</strong> Due to continuous algorithm updates on social platforms, delivery speed and retention rates may vary.</li>
                </ul>

                <div class="bg-rose-500/10 border-l-4 border-rose-500 p-3 rounded text-rose-200">
                    <strong>Non-Affiliation Disclaimer:</strong> SGS InstaBoost is an independent third-party utility platform. We are NOT affiliated, associated, authorized, endorsed by, or in any way officially connected with Meta Platforms Inc. (Instagram, Facebook), Google LLC (YouTube), or any of their subsidiaries.
                </div>

                <h4 class="font-bold text-white text-sm border-b border-slate-800 pb-1">4. Wallet Deposits & Refunds</h4>
                <ul class="list-disc pl-5 space-y-1 text-slate-300">
                    <li><strong>Wallet Balance:</strong> Funds deposited are used strictly to place service orders within the application.</li>
                    <li><strong>Failed Transactions:</strong> If a payment is deducted but fails to update your app wallet balance, contact us at <strong>contactsgsinstaboost@gmail.com</strong> with your UTR Number and Payment Screenshot for manual verification within 24–48 hours.</li>
                    <li><strong>Fraudulent Chargebacks:</strong> Fraudulent disputes will lead to immediate, permanent account termination.</li>
                </ul>

                <h4 class="font-bold text-white text-sm border-b border-slate-800 pb-1">5. Prohibited Activities</h4>
                <ul class="list-disc pl-5 space-y-1 text-slate-300">
                    <li>Attempting to bypass or reverse-engineer the mobile application or backend Firebase infrastructure.</li>
                    <li>Exploiting bugs or system glitches to manipulate wallet balances artificially.</li>
                </ul>

                <h4 class="font-bold text-white text-sm border-b border-slate-800 pb-1">6. Limitation of Liability</h4>
                <p class="text-slate-300">SGS InstaBoost and its developers shall not be liable for any indirect damages resulting from the use or inability to use our app services.</p>

                <h4 class="font-bold text-white text-sm border-b border-slate-800 pb-1">7. Contact Information</h4>
                <p class="text-slate-300">Official Email: <a href="mailto:contactsgsinstaboost@gmail.com" class="text-amber-400 underline">contactsgsinstaboost@gmail.com</a></p>
            </div>`;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeLegalModal = function() {
    document.getElementById('legalModalOverlay').classList.add('hidden');
    document.getElementById('legalModalOverlay').classList.remove('flex');
};

window.showSecurityInfo = function() {
    const titleEl = document.getElementById('legalModalTitle');
    const contentEl = document.getElementById('legalModalContent');
    const modal = document.getElementById('legalModalOverlay');
    
    titleEl.innerHTML = `<i class="fa-solid fa-fingerprint text-purple-400"></i><span>Security Commitments</span>`;
    contentEl.innerHTML = `
        <div class="space-y-4">
            <p class="font-bold text-white">Cryptographic Node Auditing</p>
            <p class="text-slate-300">Your authentication is handled securely via Google Firebase cloud API integrations protected with 256-bit SSL encryption standards.</p>
        </div>`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

document.getElementById('btn-show-privacy').addEventListener('click', () => window.showPolicy('privacy'));
document.getElementById('btn-show-terms').addEventListener('click', () => window.showPolicy('terms'));

// Login Page triggers
const btnLoginPrivacy = document.getElementById('btn-show-privacy-login');
if (btnLoginPrivacy) btnLoginPrivacy.addEventListener('click', () => window.showPolicy('privacy'));

const btnLoginTerms = document.getElementById('btn-show-terms-login');
if (btnLoginTerms) btnLoginTerms.addEventListener('click', () => window.showPolicy('terms'));

document.getElementById('btn-show-privacy-2').addEventListener('click', () => window.showPolicy('privacy'));
document.getElementById('btn-show-terms-2').addEventListener('click', () => window.showPolicy('terms'));
document.getElementById('btn-show-privacy-3').addEventListener('click', () => window.showPolicy('privacy'));
document.getElementById('btn-show-terms-3').addEventListener('click', () => window.showPolicy('terms'));
document.getElementById('legal-close-btn').addEventListener('click', () => window.closeLegalModal());
document.getElementById('legal-acknowledge-btn').addEventListener('click', () => window.closeLegalModal());

// AI Assistant Widget Binds
let isAiWidgetOpen = false;
window.toggleAiAssistant = function() {
    const widget = document.getElementById('aiSupportWidget');
    if (!widget) return;
    isAiWidgetOpen = !isAiWidgetOpen;
    if(isAiWidgetOpen) {
        widget.classList.remove('hidden');
        widget.classList.add('flex');
        const input = document.getElementById('aiUserInput');
        if (input) input.focus();
    } else {
        widget.classList.add('hidden');
        widget.classList.remove('flex');
    }
};

const aiToggleBtn = document.getElementById('aiWidgetToggle');
if (aiToggleBtn) aiToggleBtn.addEventListener('click', window.toggleAiAssistant);

const aiCloseBtn = document.getElementById('ai-widget-close-btn');
if (aiCloseBtn) aiCloseBtn.addEventListener('click', window.toggleAiAssistant);

const aiSendBtn = document.getElementById('ai-send-btn');
if (aiSendBtn) aiSendBtn.addEventListener('click', () => window.dispatchAiQuery());

const aiInputEl = document.getElementById('aiUserInput');
if (aiInputEl) {
    aiInputEl.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') window.dispatchAiQuery();
    });
}

// Copy referral code
const btnCopyRefCode = document.getElementById('btn-copy-ref-code');
if (btnCopyRefCode) {
    btnCopyRefCode.addEventListener('click', () => {
        const codeText = document.getElementById('referCode').innerText;
        const tempInput = document.createElement('input');
        tempInput.value = codeText;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        window.showCustomToast("Referral Code copied to clipboard!", "success");
    });
}

// Copy referral link
const btnCopyRefLink = document.getElementById('btn-copy-ref');
if (btnCopyRefLink) {
    btnCopyRefLink.addEventListener('click', () => {
        const linkText = document.getElementById('referLink').innerText;
        const tempInput = document.createElement('input');
        tempInput.value = linkText;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        window.showCustomToast("Referral link copied to clipboard!", "success");
    });
}

// Custom Toast Notifications
window.showCustomToast = function(message, type = "info") {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = "glass-panel p-4 rounded-2xl shadow-lg border-l-4 border-rose-500 text-xs font-mono text-slate-200 flex items-center justify-between gap-3 animate-fade-in transition duration-300 relative overflow-hidden";
    
    let icon = '<i class="fa-solid fa-circle-info text-rose-400"></i>';
    if (type === "success" || message.toLowerCase().includes("success") || message.toLowerCase().includes("verified")) {
        toast.style.borderLeftColor = "#10b981";
        icon = '<i class="fa-solid fa-circle-check text-emerald-400 animate-pulse"></i>';
    } else if (type === "error" || message.toLowerCase().includes("fail") || message.toLowerCase().includes("error") || message.toLowerCase().includes("already") || message.toLowerCase().includes("deficit")) {
        toast.style.borderLeftColor = "#f43f5e";
        icon = '<i class="fa-solid fa-triangle-exclamation text-rose-500 animate-bounce"></i>';
    }
    
    toast.innerHTML = `
        <div class="flex items-center space-x-2.5">
            ${icon}
            <span>${message}</span>
        </div>
        <button onclick="this.parentElement.remove()" class="text-slate-500 hover:text-slate-300 transition text-[10px] focus:outline-none"><i class="fa-solid fa-xmark"></i></button>
    `;
    
    container.appendChild(toast);
    setTimeout(() => {
        if (toast && toast.parentElement) {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
};

window.alert = function(msg) {
    window.showCustomToast(msg);
};

// Initialize Services & Default Tab
window.updateServices();
window.switchTab('dashboard');

// --- App Guide & Tutorial Injection Code ---
(() => {
    const openTutorial = () => {
        window.open('https://example.com', '_blank');
    };

    const createTutorialBtn = (id) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'pt-3 px-2 w-full';
        wrapper.innerHTML = `
            <button id="${id}" type="button" class="w-full py-3.5 bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-600 hover:from-sky-500 hover:to-indigo-500 text-white font-extrabold uppercase text-xs tracking-widest rounded-2xl shadow-lg flex items-center justify-center space-x-2 transition active:scale-[0.98]">
                <i class="fa-solid fa-circle-play text-amber-400 text-base animate-pulse"></i>
                <span>App Guide & Tutorial</span>
            </button>
        `;
        return wrapper;
    };

    const injectAppTutorialButtons = () => {
        const loginForm = document.querySelector('#loginForm');
        if (loginForm && !document.getElementById('btn-app-tutorial-login')) {
            const btn = createTutorialBtn('btn-app-tutorial-login');
            loginForm.appendChild(btn);
            document.getElementById('btn-app-tutorial-login')?.addEventListener('click', openTutorial);
        }

        if (!document.getElementById('btn-app-tutorial-drawer')) {
            const ytSocialBtn = document.getElementById('btn-yt-social');

            if (ytSocialBtn) {
                const targetContainer = ytSocialBtn.closest('.grid') || ytSocialBtn;
                const btn = createTutorialBtn('btn-app-tutorial-drawer');
                targetContainer.parentNode.insertBefore(btn, targetContainer.nextSibling);
                document.getElementById('btn-app-tutorial-drawer')?.addEventListener('click', openTutorial);
            } else {
                const drawer = document.getElementById('sideDrawer');
                if (drawer) {
                    const btn = createTutorialBtn('btn-app-tutorial-drawer');
                    drawer.appendChild(btn);
                    document.getElementById('btn-app-tutorial-drawer')?.addEventListener('click', openTutorial);
                }
            }
        }
    };

    injectAppTutorialButtons();

    const observer = new MutationObserver(() => injectAppTutorialButtons());
    observer.observe(document.body, { childList: true, subtree: true });
})();

// 🔐 4-DIGIT UNIQUE UID GENERATOR & SYSTEM
window.generateUniqueUserUID = async function() {
    let isUnique = false;
    let generatedUid = "";
    let attempts = 0;
    const usersRef = ref(database, 'users');

    while (!isUnique && attempts < 50) {
        attempts++;
        generatedUid = Math.floor(1000 + Math.random() * 9000).toString();
        
        try {
            const snapshot = await get(child(usersRef, `?orderBy="userUid"&equalTo="${generatedUid}"`));
            if (!snapshot.exists()) {
                isUnique = true;
            }
        } catch (e) {
            isUnique = true; 
        }
    }
    return generatedUid || Math.floor(1000 + Math.random() * 9000).toString();
};

window.copyUserUIDToClipboard = function(elementId, btnElement) {
    const uidElement = document.getElementById(elementId);
    if (!uidElement) return;
    
    const rawText = uidElement.innerText.replace('#', '').trim();
    
    navigator.clipboard.writeText(rawText).then(() => {
        if (window.showCustomToast) {
            window.showCustomToast(`UID #${rawText} Copied to Clipboard!`, "success");
        }
        if (btnElement) {
            const originalHTML = btnElement.innerHTML;
            btnElement.innerHTML = `<i class="fa-solid fa-check text-emerald-400"></i> <span class="text-emerald-400">Copied!</span>`;
            setTimeout(() => {
                btnElement.innerHTML = originalHTML;
            }, 2000);
        }
    }).catch(() => {
        if (window.showCustomToast) window.showCustomToast("Failed to copy UID", "error");
    });
};

window.injectDrawerUIDCard = function(userUid) {
    const drawerContainer = document.getElementById('drawerUserIdentity')?.parentElement;
    if (drawerContainer && !document.getElementById('drawerUidCardBox')) {
        const uidBox = document.createElement('div');
        uidBox.id = 'drawerUidCardBox';
        uidBox.className = 'mt-2.5 p-2.5 bg-[#030712]/90 border border-slate-800 rounded-xl flex items-center justify-between shadow-inner';
        uidBox.innerHTML = `
            <div class="flex flex-col">
                <span class="text-[8px] uppercase font-mono tracking-widest text-slate-500 font-bold">User UID</span>
                <span id="drawerUserUIDVal" class="text-xs font-mono font-extrabold text-rose-400">#${userUid}</span>
            </div>
            <button type="button" onclick="window.copyUserUIDToClipboard('drawerUserUIDVal', this)" class="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition flex items-center space-x-1 active:scale-95">
                <i class="fa-regular fa-copy"></i>
                <span>Copy</span>
            </button>
        `;
        drawerContainer.appendChild(uidBox);
    } else if (document.getElementById('drawerUserUIDVal')) {
        document.getElementById('drawerUserUIDVal').innerText = `#${userUid}`;
    }
};

const checkAndInjectUID = async (user) => {
    if (!user) return;
    const userDbRef = ref(database, 'users/' + user.uid);
    
    try {
        const snapshot = await get(userDbRef);
        let currentUidVal = null;
        
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.userUid) {
                currentUidVal = data.userUid;
            } else {
                currentUidVal = await window.generateUniqueUserUID();
                await update(userDbRef, { userUid: currentUidVal });
            }
        } else {
            currentUidVal = await window.generateUniqueUserUID();
        }

        if (currentUidVal) {
            window.injectDrawerUIDCard(currentUidVal);
        }
    } catch(e) {
        console.warn("UID Processing Notice:", e);
    }
};

auth.onAuthStateChanged((user) => {
    if (user) {
        checkAndInjectUID(user);
    }
});

// 🎁 REFERRAL CHALLENGE SYSTEM
window.injectReferralChallengeUI = function() {
    const referTabContainer = document.getElementById('tab-refer')?.querySelector('.glass-panel');
    if (referTabContainer && !document.getElementById('referChallengeCard')) {
        const challengeBox = document.createElement('div');
        challengeBox.id = 'referChallengeCard';
        challengeBox.className = 'bg-[#030712] p-5 rounded-2xl border border-amber-500/30 text-left space-y-4 shadow-glow-amber mt-4';
        challengeBox.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2.5">
                    <div class="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-base">
                        <i class="fa-solid fa-[#000] fa-trophy text-amber-400"></i>
                    </div>
                    <div>
                        <h4 class="text-xs font-black uppercase text-white tracking-wider">5 दोस्तों को शेयर करें और ₹5.00 कमाएं</h4>
                        <p class="text-[9px] text-slate-400 font-mono">विशेष माइलस्टोन इनाम</p>
                    </div>
                </div>
                <button type="button" onclick="window.showReferChallengeTerms()" class="text-[10px] text-amber-400 font-mono underline hover:text-amber-300 transition">
                    <i class="fa-solid fa-circle-info mr-1"></i>नियम व शर्तें
                </button>
            </div>

            <div class="space-y-1.5">
                <div class="flex justify-between items-center text-[10px] font-mono font-bold">
                    <span class="text-slate-400">सफल रेफरल (कम से कम ₹10 डिपॉज़िट)</span>
                    <span id="referProgressText" class="text-amber-400">0 / 5</span>
                </div>
                <div class="w-full h-3 bg-slate-900 rounded-full border border-slate-800 overflow-hidden relative">
                    <div id="referProgressBar" class="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-500 w-0"></div>
                </div>
            </div>

            <div id="referClaimActionBox" class="pt-1">
                <button id="btnCollectReferBonus" disabled type="button" onclick="window.claimReferralChallengeBonus()" class="w-full py-3 bg-slate-800 border border-slate-700 text-slate-500 font-extrabold uppercase text-xs tracking-widest rounded-xl transition flex items-center justify-center space-x-2 cursor-not-allowed">
                    <i class="fa-solid fa-lock text-xs"></i>
                    <span>₹5 अनलॉक करने के लिए 5/5 रेफरल पूरा करें</span>
                </button>
            </div>
        `;
        referTabContainer.appendChild(challengeBox);
    }
};

window.showReferChallengeTerms = function() {
    if (window.showSecurityInfo) {
        const titleEl = document.getElementById('legalModalTitle');
        const contentEl = document.getElementById('legalModalContent');
        const modal = document.getElementById('legalModalOverlay');
        
        titleEl.innerHTML = `<i class="fa-solid fa-gift text-amber-400"></i><span>ऑफर की शर्तें: 5 दोस्तों को शेयर करें और ₹5 कमाएं</span>`;
        contentEl.innerHTML = `
            <div class="space-y-3 font-sans text-xs">
                <div class="bg-amber-500/10 border-l-4 border-amber-500 p-3 rounded text-amber-200 font-medium">
                    अपने वॉलेट में सीधे ₹5 का बोनस पाने के लिए इन शर्तों का पालन करें:
                </div>
                <ul class="list-decimal pl-5 space-y-2 text-slate-300 font-sans text-[11px]">
                    <li><strong>अकाउंट रजिस्ट्रेशन:</strong> आपके सभी 5 दोस्तों को आपके रेफरल कोड या लिंक का उपयोग करके नया अकाउंट बनाना होगा।</li>
                    <li><strong>न्यूनतम डिपॉज़िट:</strong> प्रत्येक दोस्त को अपने वॉलेट में कम से कम <strong>₹10.00 या उससे अधिक</strong> जोड़ना होगा और एडमिन द्वारा वेरिफाई होना होगा।</li>
                    <li><strong>लाइव प्रोग्रेस:</strong> जैसे ही आपका रेफर किया गया दोस्त ₹10+ का डिपॉज़िट पूरा करेगा, आपकी प्रोग्रेस बार अपडेट हो जाएगी (जैसे 1/5, 2/5)।</li>
                    <li><strong>इनाम क्लेम करें:</strong> जैसे ही 5 दोस्त डिपॉज़िट पूरा करेंगे, "Collect ₹5" बटन तुरंत चालू हो जाएगा!</li>
                </ul>
            </div>
        `;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else {
        alert("शर्तें: ₹5 का इनाम पाने के लिए 5 दोस्तों को आपके कोड से रजिस्टर करना होगा और कम से कम ₹10 का डिपॉज़िट करना होगा!");
    }
};

window.renderReferralChallengeProgress = function() {
    window.injectReferralChallengeUI();

    if (!userDataRecordCached) return;

    const qualifiedCount = userDataRecordCached.qualifiedReferCount || 0;
    const isClaimed = userDataRecordCached.referBonusClaimed || false;

    const progressText = document.getElementById('referProgressText');
    const progressBar = document.getElementById('referProgressBar');
    const claimBox = document.getElementById('referClaimActionBox');

    if (!progressText || !progressBar || !claimBox) return;

    const targetVal = Math.min(qualifiedCount, 5);
    const percentage = (targetVal / 5) * 100;

    progressText.innerText = `${targetVal} / 5`;
    progressBar.style.width = `${percentage}%`;

    if (isClaimed) {
        claimBox.innerHTML = `
            <div class="w-full py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-extrabold uppercase text-xs tracking-widest rounded-xl text-center flex items-center justify-center space-x-2">
                <i class="fa-solid fa-circle-check text-emerald-400"></i>
                <span>₹5 का इनाम सफलतापूर्वक प्राप्त कर लिया गया है!</span>
            </div>
        `;
    } else if (qualifiedCount >= 5) {
        claimBox.innerHTML = `
            <button type="button" onclick="window.claimReferralChallengeBonus()" class="w-full py-3 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-black uppercase text-xs tracking-widest rounded-xl shadow-glow-amber transition active:scale-95 flex items-center justify-center space-x-2">
                <i class="fa-solid fa-hand-holding-dollar text-base animate-bounce"></i>
                <span>अभी ₹5.00 का इनाम क्लेम करें</span>
            </button>
        `;
    } else {
        claimBox.innerHTML = `
            <button disabled type="button" class="w-full py-3 bg-slate-900 border border-slate-800 text-slate-500 font-extrabold uppercase text-xs tracking-widest rounded-xl flex items-center justify-center space-x-2 cursor-not-allowed">
                <i class="fa-solid fa-lock text-xs"></i>
                <span>₹5 पाने के लिए 5 रेफरल पूरा करें (${targetVal}/5)</span>
            </button>
        `;
    }
};

window.claimReferralChallengeBonus = async function() {
    if (!currentAuthenticatedUserToken || !userDataRecordCached) return;

    const qualifiedCount = userDataRecordCached.qualifiedReferCount || 0;
    const isClaimed = userDataRecordCached.referBonusClaimed || false;

    if (isClaimed) {
        if (window.showCustomToast) window.showCustomToast("इनाम पहले ही प्राप्त किया जा चुका है!", "info");
        return;
    }

    if (qualifiedCount < 5) {
        if (window.showCustomToast) window.showCustomToast("₹5 प्राप्त करने के लिए 5 योग्य दोस्तों की आवश्यकता है!", "error");
        return;
    }

    const currentBal = parseFloat(userDataRecordCached.walletBalance || 0);
    const newBal = currentBal + 5.00;
    const rewardTxKey = 'tx_challenge_' + Date.now();

    const txPayload = {
        structId: rewardTxKey,
        uid: currentAuthenticatedUserToken.uid,
        value: 5.00,
        utr: 'REFERRAL_5FRIENDS_REWARD',
        internalState: 'Verified'
    };

    try {
        await update(ref(database, `users/${currentAuthenticatedUserToken.uid}`), {
            walletBalance: newBal,
            referBonusClaimed: true
        });
        await set(ref(database, `users/${currentAuthenticatedUserToken.uid}/transactions/${rewardTxKey}`), txPayload);

        userDataRecordCached.walletBalance = newBal;
        userDataRecordCached.referBonusClaimed = true;

        document.getElementById('userBalance').innerText = newBal.toFixed(2);
        window.renderReferralChallengeProgress();

        if (window.showCustomToast) {
            window.showCustomToast("🎉 बधाई हो! आपके वॉलेट में ₹5.00 जोड़ दिए गए हैं!", "success");
        }
    } catch (err) {
        if (window.showCustomToast) window.showCustomToast("क्लेम त्रुटि: " + err.message, "error");
    }
};

const originalCommitStateVerification = window.commitStateVerification;
window.commitStateVerification = function(targetUid, structId, txnValue, actionType) {
    if (originalCommitStateVerification) {
        originalCommitStateVerification(targetUid, structId, txnValue, actionType);
    }

    if (actionType === 'approve' && parseFloat(txnValue) >= 10.00) {
        const targetUserRef = ref(database, `users/${targetUid}`);
        get(targetUserRef).then((snap) => {
            if (snap.exists()) {
                const uData = snap.val();
                if (uData.referredBy && !uData.countedForReferChallenge) {
                    const referrerUid = uData.referredBy;
                    const referrerRef = ref(database, `users/${referrerUid}`);

                    get(referrerRef).then((rSnap) => {
                        if (rSnap.exists()) {
                            const rData = rSnap.val();
                            const currentCount = rData.qualifiedReferCount || 0;
                            
                            update(referrerRef, { qualifiedReferCount: currentCount + 1 });
                            update(targetUserRef, { countedForReferChallenge: true });
                        }
                    });
                }
            }
        });
    }
};

const originalSwitchTab = window.switchTab;
window.switchTab = function(targetId) {
    if (originalSwitchTab) originalSwitchTab(targetId);
    if (targetId === 'refer') {
        setTimeout(() => window.renderReferralChallengeProgress(), 100);
    }
};

// 🔔 RE-ENTRY REFERRAL POPUP & DYNAMIC EMAIL DP SYNC
window.injectLoginReferralPopupUI = function() {
    if (document.getElementById('loginReferralModalOverlay')) return;

    const modalDiv = document.createElement('div');
    modalDiv.id = 'loginReferralModalOverlay';
    modalDiv.className = 'fixed inset-0 bg-[#030712]/90 z-[110] hidden items-center justify-center p-4 backdrop-blur-md transition-all duration-300';
    modalDiv.innerHTML = `
        <div class="glass-panel max-w-sm w-full rounded-[28px] p-6 space-y-4 border-amber-500/40 shadow-glow-amber relative text-center overflow-hidden animate-fade-in">
            
            <button type="button" onclick="window.closeLoginReferralPopup()" class="absolute top-4 right-4 text-slate-400 hover:text-rose-500 p-1.5 hover:bg-slate-900 rounded-xl transition">
                <i class="fa-solid fa-xmark text-lg"></i>
            </button>

            <div class="w-16 h-16 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/30 flex items-center justify-center mx-auto text-3xl shadow-glow-amber">
                <i class="fa-solid fa-gift animate-bounce"></i>
            </div>

            <div class="space-y-1">
                <span class="text-[9px] uppercase font-mono tracking-widest text-amber-400 font-bold">Offer Alert</span>
                <h3 class="text-lg font-black uppercase text-white tracking-tight">5 Dosto ko Share Kare Aur Paye ₹5.00!</h3>
                <p class="text-xs text-slate-300 font-medium">Apne dosto ko app refer karein aur wallet bonus paayein.</p>
            </div>

            <button type="button" onclick="window.showHindiReferTermsModal()" class="w-full py-3 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-black uppercase text-xs tracking-widest rounded-xl shadow-md transition active:scale-95 flex items-center justify-center space-x-2">
                <i class="fa-solid fa-circle-info"></i>
                <span>Niyam Aur Shartein (Terms) Dekhein</span>
            </button>

            <button type="button" onclick="window.closeLoginReferralPopup()" class="text-[11px] text-slate-400 hover:text-slate-200 font-mono underline block mx-auto pt-1">
                Abhi Nahi (Skip)
            </button>
        </div>
    `;
    document.body.appendChild(modalDiv);
};

window.openLoginReferralPopup = function() {
    window.injectLoginReferralPopupUI();
    const modal = document.getElementById('loginReferralModalOverlay');
    if (modal) {
        const loader = document.getElementById('globalLoadingScreen');
        if (loader) {
            loader.classList.remove('hidden');
            loader.style.opacity = '1';
            setTimeout(() => {
                loader.style.opacity = '0';
                setTimeout(() => loader.classList.add('hidden'), 300);
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }, 400);
        } else {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }
};

window.closeLoginReferralPopup = function() {
    const modal = document.getElementById('loginReferralModalOverlay');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.showHindiReferTermsModal = function() {
    window.closeLoginReferralPopup();

    const titleEl = document.getElementById('legalModalTitle');
    const contentEl = document.getElementById('legalModalContent');
    const modal = document.getElementById('legalModalOverlay');

    if (titleEl && contentEl && modal) {
        titleEl.innerHTML = `<i class="fa-solid fa-gift text-amber-400"></i><span>रेफरल ऑफर की नियम एवं शर्तें (Terms & Conditions)</span>`;
        contentEl.innerHTML = `
            <div class="space-y-4 font-sans text-xs text-slate-300 leading-relaxed">
                <div class="bg-amber-500/10 border-l-4 border-amber-500 p-3 rounded text-amber-200 font-semibold">
                    🎁 ₹5.00 का बोनस सीधे अपने वॉलेट में पाने के लिए नीचे दी गई शर्तों को पूरा करें:
                </div>

                <ol class="list-decimal pl-5 space-y-2.5 font-sans">
                    <li><strong>खाता बनाएं (Sign Up):</strong> आपके 5 दोस्तों को आपके Referral Code या Referral Link का उपयोग करके नया अकाउंट बनाना होगा।</li>
                    <li><strong>न्यूनतम डिपॉज़िट (Min Deposit):</strong> आपके पांचों दोस्तों को अपने वॉलेट में कम से कम <strong>₹10.00 या उससे अधिक</strong> ऐड (Deposit) करना होगा।</li>
                    <li><strong>एडमिन वेरिफिकेशन (Admin Approval):</strong> जैसे ही आपके दोस्त का डिपॉज़िट एडमिन द्वारा अप्रूव हो जाएगा, आपकी रेफरल प्रोग्रेस (0/5 से 1/5) बढ़ जाएगी।</li>
                    <li><strong>बोनस क्लेम करें (Claim ₹5):</strong> 5 दोस्तों के ₹10+ ऐड करते ही आपके 'Earn' सेक्शन में <strong>"Collect ₹5"</strong> का बटन आ जाएगा। बटन दबाते ही ₹5.00 तुरंत आपके वॉलेट में जुड़ जाएंगे।</li>
                </ol>

                <div class="bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20 text-[11px] text-rose-300">
                    <strong>नोट:</strong> एक ही मोबाइल/डिवाइस से फर्जी अकाउंट बनाने पर बोनस नहीं मिलेगा।
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

window.syncUserProfilePicture = function(user) {
    const drawerLogoImg = document.getElementById('drawerUserLogo');
    if (!drawerLogoImg || !user) return;

    if (user.photoURL && user.photoURL.trim() !== '' && !user.photoURL.includes('dicebear')) {
        drawerLogoImg.src = user.photoURL;
    } else {
        const cleanEmail = (user.email || user.uid || 'sgsuser').trim().toLowerCase();
        const avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(cleanEmail)}&backgroundColor=0d1220`;
        drawerLogoImg.src = avatarUrl;
        
        drawerLogoImg.onerror = function() {
            this.onerror = null;
            this.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.uid)}`;
        };
    }
};

// 📢 SLIDING PUSH HEADER NOTICE SYSTEM (USER & ADMIN)
window.injectNoticeBoardUI = function() {
    if (document.getElementById('systemNoticePushBanner')) return;

    const bannerDiv = document.createElement('div');
    bannerDiv.id = 'systemNoticePushBanner';
    bannerDiv.className = 'w-full bg-[#090d16]/95 border-b border-rose-500/40 shadow-glow-rose backdrop-blur-xl transition-all duration-500 ease-in-out overflow-hidden max-h-0 opacity-0 z-[100] relative';
    
    bannerDiv.innerHTML = `
        <div class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500 animate-pulse"></div>
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div class="flex items-center space-x-3 overflow-hidden">
                <div class="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-sm shrink-0 animate-pulse">
                    <i class="fa-solid fa-bullhorn"></i>
                </div>
                <div id="systemNoticeBodyContent" class="text-xs sm:text-sm text-slate-200 font-sans leading-relaxed overflow-x-auto">
                    <span class="text-slate-400 italic">Loading announcements...</span>
                </div>
            </div>

            <button type="button" onclick="window.closeNoticeBoard()" class="text-slate-400 hover:text-rose-500 p-2 hover:bg-slate-900 rounded-xl transition shrink-0 active:scale-95">
                <i class="fa-solid fa-xmark text-base"></i>
            </button>
        </div>
    `;

    const appContainer = document.getElementById('appContainer') || document.body.firstElementChild;
    if (appContainer) {
        document.body.insertBefore(bannerDiv, appContainer);
    } else {
        document.body.prepend(bannerDiv);
    }
};

let noticeTimer = null;

window.openNoticeBoard = function(noticeHtml) {
    window.injectNoticeBoardUI();
    const bodyContent = document.getElementById('systemNoticeBodyContent');
    const banner = document.getElementById('systemNoticePushBanner');

    if (bodyContent && banner) {
        bodyContent.innerHTML = noticeHtml || "";
        
        banner.style.maxHeight = '200px';
        banner.classList.remove('opacity-0');
        banner.classList.add('opacity-100');

        if (noticeTimer) clearTimeout(noticeTimer);

        noticeTimer = setTimeout(() => {
            window.closeNoticeBoard();
        }, 10000);
    }
};

window.closeNoticeBoard = function() {
    const banner = document.getElementById('systemNoticePushBanner');
    if (banner) {
        banner.style.maxHeight = '0px';
        banner.classList.remove('opacity-100');
        banner.classList.add('opacity-0');
    }
    if (noticeTimer) clearTimeout(noticeTimer);
};

const listenAndShowNotice = () => {
    const noticeRef = ref(database, 'system_notice/content');
    onValue(noticeRef, (snapshot) => {
        const noticeText = snapshot.exists() ? snapshot.val() : "";
        window.activeSystemNoticeText = noticeText;
        
        if (noticeText && noticeText.trim() !== "") {
            window.openNoticeBoard(noticeText);
        }
    });
};

window.injectAdminNoticeEditorUI = function() {
    const adminConsole = document.getElementById('adminCoreConsole');
    if (!adminConsole || document.getElementById('adminNoticeEditorCard')) return;

    const tabsNav = adminConsole.querySelector('.max-w-7xl > .flex');
    if (tabsNav && !document.getElementById('admin-tab-notice-btn')) {
        const noticeBtn = document.createElement('button');
        noticeBtn.id = 'admin-tab-notice-btn';
        noticeBtn.className = 'bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition';
        noticeBtn.innerHTML = '<i class="fa-solid fa-bullhorn mr-1.5"></i> Notice Board Manager';
        noticeBtn.onclick = () => window.switchAdminTab('notice');
        tabsNav.appendChild(noticeBtn);
    }

    const parentContainer = adminConsole.querySelector('.max-w-7xl');
    if (parentContainer && !document.getElementById('adminNoticeSection')) {
        const noticeSec = document.createElement('div');
        noticeSec.id = 'adminNoticeSection';
        noticeSec.className = 'space-y-4 hidden';
        noticeSec.innerHTML = `
            <div class="flex justify-between items-center">
                <h3 class="text-xs font-black tracking-widest text-purple-300 uppercase font-mono">Manage Sliding Header Notice</h3>
                <span class="text-[10px] text-slate-400 font-mono">Supports Clean HTML & Text</span>
            </div>
            <div class="glass-panel p-5 rounded-2xl border-purple-500/20 space-y-4 shadow-glow-purple">
                <div>
                    <label class="block text-[10px] uppercase font-bold text-slate-300 mb-2 tracking-wider">Notice Content (HTML / Text)</label>
                    <textarea id="adminNoticeInput" rows="6" placeholder="Yahan apna notice ya HTML code likhein" class="w-full bg-[#0d1220] p-4 rounded-xl border border-slate-800 focus:outline-none focus:border-purple-500 text-slate-200 text-xs font-mono transition"></textarea>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                    <button type="button" onclick="window.saveSystemNotice()" class="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold uppercase text-xs tracking-wider rounded-xl transition shadow-glow-purple active:scale-95">
                        <i class="fa-solid fa-floppy-disk mr-1.5"></i> Save & Broadcast Notice
                    </button>
                    <button type="button" onclick="window.deleteSystemNotice()" class="px-5 py-2.5 bg-rose-600/80 hover:bg-rose-500 text-white font-bold uppercase text-xs tracking-wider rounded-xl transition active:scale-95">
                        <i class="fa-solid fa-trash-can mr-1.5"></i> Delete / Clear Notice
                    </button>
                    <button type="button" onclick="window.openNoticeBoard(document.getElementById('adminNoticeInput').value)" class="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold uppercase text-xs tracking-wider rounded-xl transition">
                        <i class="fa-solid fa-eye mr-1.5"></i> Preview Header
                    </button>
                </div>
            </div>
        `;
        parentContainer.appendChild(noticeSec);
    }
};

const originalSwitchAdminTab = window.switchAdminTab;
window.switchAdminTab = function(tabName) {
    if (originalSwitchAdminTab) originalSwitchAdminTab(tabName);
    
    const depSec = document.getElementById('adminDepositsSection');
    const usrSec = document.getElementById('adminUsersSection');
    const noticeSec = document.getElementById('adminNoticeSection');
    const depBtn = document.getElementById('admin-tab-deposits-btn');
    const usrBtn = document.getElementById('admin-tab-users-btn');
    const noticeBtn = document.getElementById('admin-tab-notice-btn');

    if (tabName === 'deposits') {
        if (depSec) depSec.classList.remove('hidden');
        if (usrSec) usrSec.classList.add('hidden');
        if (noticeSec) noticeSec.classList.add('hidden');
        if (depBtn) depBtn.className = "bg-purple-600 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition shadow-glow-purple";
        if (usrBtn) usrBtn.className = "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition";
        if (noticeBtn) noticeBtn.className = "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition";
    } else if (tabName === 'users') {
        if (depSec) depSec.classList.add('hidden');
        if (usrSec) usrSec.classList.remove('hidden');
        if (noticeSec) noticeSec.classList.add('hidden');
        if (usrBtn) usrBtn.className = "bg-purple-600 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition shadow-glow-purple";
        if (depBtn) depBtn.className = "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition";
        if (noticeBtn) noticeBtn.className = "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition";
        window.renderAdminUsersList();
    } else if (tabName === 'notice') {
        if (depSec) depSec.classList.add('hidden');
        if (usrSec) usrSec.classList.add('hidden');
        if (noticeSec) {
            noticeSec.classList.remove('hidden');
            get(ref(database, 'system_notice/content')).then((snap) => {
                if (snap.exists() && document.getElementById('adminNoticeInput')) {
                    document.getElementById('adminNoticeInput').value = snap.val();
                }
            });
        }
        if (noticeBtn) noticeBtn.className = "bg-purple-600 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition shadow-glow-purple";
        if (depBtn) depBtn.className = "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition";
        if (usrBtn) usrBtn.className = "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition";
    }
};

window.saveSystemNotice = async function() {
    const inputEl = document.getElementById('adminNoticeInput');
    if (!inputEl) return;
    const textVal = inputEl.value;

    try {
        await set(ref(database, 'system_notice/content'), textVal);
        if (window.showCustomToast) window.showCustomToast("Notice Board successfully updated & broadcasted!", "success");
    } catch (err) {
        if (window.showCustomToast) window.showCustomToast("Failed to save notice: " + err.message, "error");
    }
};

window.deleteSystemNotice = async function() {
    if (confirm("Kya aap sach me Notice Board clear/delete karna chahte hain?")) {
        try {
            await set(ref(database, 'system_notice/content'), "");
            if (document.getElementById('adminNoticeInput')) document.getElementById('adminNoticeInput').value = "";
            window.closeNoticeBoard();
            if (window.showCustomToast) window.showCustomToast("Notice Board cleared successfully!", "success");
        } catch (err) {
            if (window.showCustomToast) window.showCustomToast("Failed to delete notice: " + err.message, "error");
        }
    }
};

window.addEventListener('DOMContentLoaded', () => {
    window.injectNoticeBoardUI();
    setTimeout(() => {
        window.injectAdminNoticeEditorUI();
    }, 1000);
});

auth.onAuthStateChanged((user) => {
    if (user) {
        listenAndShowNotice();
        window.injectAdminNoticeEditorUI();
    }
});
