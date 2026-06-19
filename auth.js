// Configuration
const API_URL = 'http://localhost:8000';

// DOM Elements
const tabs = document.querySelectorAll('.auth-tab');
const forms = document.querySelectorAll('.auth-form');

const loginForm = document.getElementById('login-form');
const btnLogin = document.getElementById('btn-login');

const btnCreateAccount = document.getElementById('btn-create-account');
const btnVerifyOtp = document.getElementById('btn-verify-otp');
const signupCredentialsSection = document.getElementById('signup-credentials-section');
const signupOtpSection = document.getElementById('signup-otp-section');

// Tab Switching Logic
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs and forms
        tabs.forEach(t => t.classList.remove('active'));
        forms.forEach(f => f.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding form
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');
    });
});

// Toast Notification System
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 3s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ─── LOGIN FLOW ───
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const originalText = btnLogin.textContent;
    btnLogin.textContent = 'Signing in...';
    btnLogin.disabled = true;

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok && data.access_token) {
            localStorage.setItem('jwt_token', data.access_token);
            showToast('Login successful!', 'success');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } else {
            showToast(data.message || data.detail || 'Login failed.', 'error');
        }
    } catch (error) {
        showToast('Network error. Is the backend running?', 'error');
    } finally {
        btnLogin.textContent = originalText;
        btnLogin.disabled = false;
    }
});


// ─── SIGNUP FLOW (Step 1: Register + Send OTP) ───
btnCreateAccount.addEventListener('click', async () => {
    const fullName = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    if (!fullName || !email || !password) {
        showToast('Please fill in name, email, and password.', 'error');
        return;
    }

    const originalText = btnCreateAccount.textContent;
    btnCreateAccount.textContent = 'Creating...';
    btnCreateAccount.disabled = true;

    try {
        // 1. Register User
        const regResponse = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, full_name: fullName })
        });
        
        if (!regResponse.ok) {
            const regData = await regResponse.json();
            throw new Error(regData.detail || regData.message || 'Registration failed');
        }

        // 2. Trigger OTP
        const otpResponse = await fetch(`${API_URL}/auth/send-otp?email=${encodeURIComponent(email)}`, {
            method: 'POST'
        });

        if (!otpResponse.ok) {
            throw new Error('Failed to send verification email.');
        }

        // Transition to OTP Screen
        signupCredentialsSection.style.display = 'none';
        signupOtpSection.style.display = 'block';
        showToast('OTP sent! Check your console/email.', 'info');

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btnCreateAccount.textContent = originalText;
        btnCreateAccount.disabled = false;
    }
});

// ─── SIGNUP FLOW (Step 2: Verify OTP + Auto-Login) ───
btnVerifyOtp.addEventListener('click', async () => {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value; // Needed for auto-login
    const otp = document.getElementById('signup-otp').value;

    if (!otp) {
        showToast('Please enter the OTP.', 'error');
        return;
    }

    const originalText = btnVerifyOtp.textContent;
    btnVerifyOtp.textContent = 'Verifying...';
    btnVerifyOtp.disabled = true;

    try {
        // 1. Verify OTP
        const verifyRes = await fetch(`${API_URL}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });

        if (!verifyRes.ok) {
            const verifyData = await verifyRes.json();
            throw new Error(verifyData.detail || verifyData.message || 'Invalid OTP');
        }

        // 2. Auto-Login
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const loginData = await loginRes.json();

        if (loginRes.ok && loginData.access_token) {
            localStorage.setItem('jwt_token', loginData.access_token);
            showToast('Account verified and logged in!', 'success');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } else {
            throw new Error('Verification succeeded but auto-login failed. Please log in manually.');
        }

    } catch (error) {
        showToast(error.message, 'error');
        btnVerifyOtp.textContent = originalText;
        btnVerifyOtp.disabled = false;
    }
});
