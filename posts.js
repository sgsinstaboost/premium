// Deposit Handling (Fixed: Multi-payment support & Exact Notification Match)
window.submitDepositToServer = async function() {
    const value = parseFloat(document.getElementById('fundAmount').value);
    const identifierInput = document.getElementById('utrInput').value.trim().toUpperCase();
    
    if (!value || value <= 0 || !identifierInput || identifierInput.length < 2) { 
        window.showCustomToast("Validation report error. Verify inputs (Amount & Sender Name).", "error"); 
        return; 
    }

    if (!currentAuthenticatedUserToken) {
        window.showCustomToast("Session error: Please re-login.", "error");
        return;
    }

    const submitBtn = document.getElementById('submit-deposit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>VERIFYING PAYMENT VIA GATEWAY...</span><i class="fa-solid fa-spinner animate-spin ml-2"></i>`;
    }

    try {
        const cleanNameInput = identifierInput.toLowerCase().trim();
        const numVal = parseInt(value, 10);
        const floatVal = parseFloat(value).toFixed(2);

        // Fetch realtime PhonePe notifications
        const paymentsSnap = await get(ref(database, 'payments'));
        let autoMatched = false;
        let matchedKey = null;

        if (paymentsSnap.exists()) {
            const paymentsData = paymentsSnap.val();

            for (let key in paymentsData) {
                const item = paymentsData[key];
                const rawMsg = (typeof item === 'object' ? JSON.stringify(item) : String(item)).toLowerCase();
                const isAlreadyUsed = item && item.used === true;

                if (!isAlreadyUsed) {
                    const hasAmount = rawMsg.includes(`rs.${numVal}`) || 
                                     rawMsg.includes(`rs. ${numVal}`) || 
                                     rawMsg.includes(`rs ${numVal}`) || 
                                     rawMsg.includes(`rs.${floatVal}`) || 
                                     rawMsg.includes(`rs ${floatVal}`) || 
                                     rawMsg.includes(`₹${numVal}`) || 
                                     rawMsg.includes(`₹${floatVal}`) ||
                                     rawMsg.includes(`${numVal}`);

                    const nameParts = cleanNameInput.split(/\s+/).filter(p => p.length >= 2);
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

        if (autoMatched) {
            // Lock only this unique notification key
            if (matchedKey) {
                await update(ref(database, `payments/${matchedKey}`), { 
                    used: true, 
                    claimedBy: currentAuthenticatedUserToken.uid,
                    claimedAt: Date.now()
                });
            }

            const uniqueTxHashKey = 'tx_' + Date.now();
            const verifiedPayload = { 
                structId: uniqueTxHashKey, 
                uid: currentAuthenticatedUserToken.uid, 
                email: currentAuthenticatedUserToken.email || 'Registered User', 
                value: value, 
                utr: identifierInput, 
                internalState: 'Verified' 
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

            window.commitStateVerification(currentAuthenticatedUserToken.uid, uniqueTxHashKey, value, 'approve');

            document.getElementById('fundAmount').value = '';
            document.getElementById('utrInput').value = '';
            window.generateSecureQR();

            window.showCustomToast(`🎉 INSTANT AUTO-VERIFIED! ₹${value.toFixed(2)} added.`, "success");
            return;
        }

        // Fallback to Admin Queue
        const uniqueTxHashKey = 'tx_' + Date.now();
        const activeObjectPayload = { 
            structId: uniqueTxHashKey, 
            uid: currentAuthenticatedUserToken.uid, 
            email: currentAuthenticatedUserToken.email || 'Registered User', 
            value: value, 
            utr: identifierInput, 
            internalState: 'Processing' 
        };

        await set(ref(database, `users/${currentAuthenticatedUserToken.uid}/transactions/${uniqueTxHashKey}`), activeObjectPayload);
        await set(ref(database, `global_deposits/${uniqueTxHashKey}`), activeObjectPayload);

        document.getElementById('fundAmount').value = '';
        document.getElementById('utrInput').value = '';
        window.generateSecureQR();
        window.showCustomToast("Report generated! Awaiting audit verification.", "success");

    } catch (err) {
        console.error("Deposit Error:", err);
        window.showCustomToast("Error: " + err.message, "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `Submit Payments`;
        }
    }
};

// Auto-convert name input to UPPERCASE
const utrInputEl = document.getElementById('utrInput');
if (utrInputEl) {
    utrInputEl.addEventListener('input', function() {
        this.value = this.value.toUpperCase();
    });
}
