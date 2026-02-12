// API Configuration
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000/api'
    : `${window.location.origin}/api`;

let currentUser = null;
let currentResume = null;
let authToken = localStorage.getItem('cvg_token');

// ========== INITIALIZATION ==========

document.addEventListener('DOMContentLoaded', () => {
    console.log('CVGenius Pro initialized');
    
    // Load pricing plans
    loadPricingPlans();
    
    // Check if user is logged in
    if (authToken) {
        getCurrentUser();
    } else {
        showAuthModal();
    }

    // Event listeners
    document.getElementById('authToggle').addEventListener('click', showAuthModal);
    document.getElementById('heroSignup').addEventListener('click', showAuthModal);
    document.getElementById('loginBtn').addEventListener('click', login);
    document.getElementById('signupBtn').addEventListener('click', signup);
    document.getElementById('upgradePlanBtn').addEventListener('click', showPricing);
    document.getElementById('closeModal').addEventListener('click', closeAuthModal);

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('authModal');
        if (e.target === modal) {
            closeAuthModal();
        }
    });
});

// ========== AUTHENTICATION ==========

function showAuthModal() {
    document.getElementById('authModal').style.display = 'block';
}

function closeAuthModal() {
    document.getElementById('authModal').style.display = 'none';
}

function toggleForm(e) {
    e.preventDefault();
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    
    if (loginForm.style.display === 'none') {
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
    }
}

async function signup(e) {
    e.preventDefault();
    
    const fullName = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const currentRole = document.getElementById('signupRole').value;

    if (!fullName || !email || !password) {
        alert('Please fill in all required fields');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, password, currentRole })
        });

        const data = await response.json();

        if (data.success) {
            authToken = data.token;
            localStorage.setItem('cvg_token', authToken);
            currentUser = data.user;
            closeAuthModal();
            showDashboard();
            loadUserData();
        } else {
            alert(data.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Signup error:', error);
        alert('Error: ' + error.message);
    }
}

async function login(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        alert('Please enter email and password');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            authToken = data.token;
            localStorage.setItem('cvg_token', authToken);
            currentUser = data.user;
            closeAuthModal();
            showDashboard();
            loadUserData();
        } else {
            alert(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Error: ' + error.message);
    }
}

async function getCurrentUser() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();

        if (response.ok) {
            currentUser = data;
            showDashboard();
            loadUserData();
        } else {
            localStorage.removeItem('cvg_token');
            authToken = null;
            showAuthModal();
        }
    } catch (error) {
        console.error('Get user error:', error);
    }
}

function logout(e) {
    if (e) e.preventDefault();
    
    localStorage.removeItem('cvg_token');
    authToken = null;
    currentUser = null;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('home').style.display = 'block';
    showAuthModal();
}

// ========== DASHBOARD ==========

function showDashboard() {
    document.getElementById('dashboard').style.display = 'flex';
}

function loadUserData() {
    if (!currentUser) return;
    
    document.getElementById('dashboardName').textContent = currentUser.fullName || 'User';
    document.getElementById('dashboardPlan').textContent = (currentUser.plan || 'free').toUpperCase() + ' Plan';
    document.getElementById('settingsEmail').textContent = `Email: ${currentUser.email}`;
    document.getElementById('settingsRole').textContent = `Role: ${currentUser.currentRole || 'Not specified'}`;
    document.getElementById('settingsPlan').textContent = `Current Plan: ${(currentUser.plan || 'free').toUpperCase()}`;
    
    loadResumes();
}

function showSection(sectionId, e) {
    if (e) e.preventDefault();
    
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });
    
    // Remove active class from nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected section
    const section = document.getElementById(sectionId);
    if (section) {
        section.style.display = 'block';
    }
    
    // Add active class to clicked nav item
    event?.target?.closest('.nav-item')?.classList.add('active');
}

// ========== PRICING ==========

async function loadPricingPlans() {
    try {
        const response = await fetch(`${API_BASE}/plans`);
        const data = await response.json();

        if (data.success) {
            const pricingGrid = document.getElementById('pricingGrid');
            pricingGrid.innerHTML = data.plans.map(plan => `
                <div class="pricing-card ${plan.popular ? 'popular' : ''}">
                    ${plan.popular ? '<div class="pricing-badge">POPULAR</div>' : ''}
                    <h3 class="plan-name">${plan.name}</h3>
                    <div class="plan-price">$${plan.price}<span style="font-size: 1rem; color: var(--text-secondary);">/${plan.billing}</span></div>
                    <p class="plan-description">${plan.description}</p>
                    <ul class="plan-features">
                        ${plan.features.map(feature => `<li>${feature}</li>`).join('')}
                    </ul>
                    <button class="btn btn-primary btn-block" onclick="selectPlan('${plan.id}')">
                        ${plan.price === 0 ? 'Get Started' : 'Upgrade Now'}
                    </button>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Load pricing error:', error);
    }
}

async function selectPlan(planId) {
    if (!authToken) {
        showAuthModal();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/subscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ planId })
        });

        const data = await response.json();

        if (data.success) {
            if (planId === 'free') {
                alert('Plan activated!');
                currentUser.plan = 'free';
                loadUserData();
            } else {
                // Redirect to Stripe (mock implementation)
                alert('Redirecting to payment...');
                // window.location.href = data.stripeUrl;
            }
        }
    } catch (error) {
        console.error('Plan selection error:', error);
    }
}

function upgradePlan() {
    showSection('pricing', null);
}

function showPricing() {
    document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
}

// ========== RESUMES ==========

async function loadResumes() {
    if (!authToken) return;

    try {
        const response = await fetch(`${API_BASE}/resumes`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const resumes = await response.json();
        const resumesList = document.getElementById('resumesList');

        if (Array.isArray(resumes) && resumes.length > 0) {
            resumesList.innerHTML = resumes.map(resume => `
                <div class="card">
                    <h3>${resume.title}</h3>
                    <p>Created: ${new Date(resume.createdAt).toLocaleDateString()}</p>
                    <p>Template: ${resume.template}</p>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-primary" onclick="editResume('${resume.resumeId}')">Edit</button>
                        <button class="btn btn-secondary" onclick="deleteResume('${resume.resumeId}')">Delete</button>
                    </div>
                </div>
            `).join('');
        } else {
            resumesList.innerHTML = '<p>No resumes yet. Create your first one!</p>';
        }
    } catch (error) {
        console.error('Load resumes error:', error);
    }
}

async function createNewResume() {
    if (!authToken) {
        showAuthModal();
        return;
    }

    try {
        const title = prompt('Enter resume title:', 'My Resume');
        if (!title) return;

        const response = await fetch(`${API_BASE}/resumes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ title, template: 'modern' })
        });

        const data = await response.json();

        if (data.success) {
            currentResume = data.resume;
            showSection('editor', null);
            loadResumeToEditor(data.resume);
            alert('Resume created!');
        }
    } catch (error) {
        console.error('Create resume error:', error);
        alert('Failed to create resume');
    }
}

function editResume(resumeId) {
    if (!authToken) return;

    // Load resume and show editor
    fetch(`${API_BASE}/resumes/${resumeId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    })
    .then(r => r.json())
    .then(resume => {
        currentResume = resume;
        showSection('editor', null);
        loadResumeToEditor(resume);
    })
    .catch(err => console.error('Load resume error:', err));
}

function loadResumeToEditor(resume) {
    if (!resume.personalInfo) return;

    document.getElementById('editorName').value = resume.personalInfo.fullName || '';
    document.getElementById('editorEmail').value = resume.personalInfo.email || '';
    document.getElementById('editorPhone').value = resume.personalInfo.phone || '';
    document.getElementById('editorLocation').value = resume.personalInfo.location || '';
    document.getElementById('editorSummary').value = resume.personalInfo.summary || '';

    updateResumePreview(resume.personalInfo);
}

function updateResumePreview(data) {
    document.getElementById('previewName').textContent = data.fullName || 'John Doe';
    document.getElementById('previewEmail').textContent = data.email || 'john@example.com';
    document.getElementById('previewPhone').textContent = data.phone || '+1 (123) 456-7890';
    document.getElementById('previewLocation').textContent = data.location || 'City, State';
    document.getElementById('previewSummary').textContent = data.summary || 'Professional summary...';
}

async function saveResume() {
    if (!authToken || !currentResume) {
        alert('Please login and select a resume');
        return;
    }

    const personalInfo = {
        fullName: document.getElementById('editorName').value,
        email: document.getElementById('editorEmail').value,
        phone: document.getElementById('editorPhone').value,
        location: document.getElementById('editorLocation').value,
        summary: document.getElementById('editorSummary').value
    };

    try {
        const response = await fetch(`${API_BASE}/resumes/${currentResume.resumeId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ personalInfo })
        });

        const data = await response.json();

        if (data.success) {
            updateResumePreview(personalInfo);
            alert('Resume saved successfully!');
        }
    } catch (error) {
        console.error('Save resume error:', error);
        alert('Failed to save resume');
    }
}

async function deleteResume(resumeId) {
    if (!confirm('Are you sure you want to delete this resume?')) return;

    try {
        const response = await fetch(`${API_BASE}/resumes/${resumeId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            loadResumes();
            alert('Resume deleted');
        }
    } catch (error) {
        console.error('Delete resume error:', error);
        alert('Failed to delete resume');
    }
}

// ========== ATS TESTING ==========

async function testATS() {
    if (!authToken) {
        showAuthModal();
        return;
    }

    const resumeContent = document.getElementById('resumeContent').value;
    const jobDescription = document.getElementById('jobDescription').value;

    if (!resumeContent || !jobDescription) {
        alert('Please fill in both fields');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/ats/test`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ resumeContent, jobDescription })
        });

        const data = await response.json();

        if (data.success) {
            displayATSResults(data.report);
        }
    } catch (error) {
        console.error('ATS test error:', error);
        alert('Failed to test ATS');
    }
}

function displayATSResults(report) {
    const resultsDiv = document.getElementById('atsResults');
    const scoreCircle = document.getElementById('scoreCircle');
    const reportDetails = document.getElementById('reportDetails');

    scoreCircle.textContent = report.atsScore + '%';
    scoreCircle.parentElement.parentElement.style.display = 'flex';

    let html = '<h4>Detailed Report</h4>';
    
    html += `
        <div class="report-item">
            <h4>Keyword Match: ${report.keyword.score}%</h4>
            <p>${report.keyword.analysis}</p>
            ${report.keyword.missingKeywords.length > 0 ? 
                `<p><strong>Missing:</strong> ${report.keyword.missingKeywords.join(', ')}</p>` : ''}
        </div>
    `;

    html += `
        <div class="report-item">
            <h4>Formatting: ${report.formatting.score}%</h4>
            <p>${report.formatting.analysis}</p>
            ${report.formatting.suggestions.map(s => `<p>• ${s}</p>`).join('')}
        </div>
    `;

    html += `
        <div class="report-item">
            <h4>Readability: ${report.readability.score}%</h4>
            <p>${report.readability.analysis}</p>
            ${report.readability.suggestions.map(s => `<p>• ${s}</p>`).join('')}
        </div>
    `;

    html += '<h4>Recommendations</h4>';
    html += report.recommendations.map(rec => `<p>✓ ${rec}</p>`).join('');

    reportDetails.innerHTML = html;
    resultsDiv.style.display = 'block';
}

// ========== AI SUGGESTIONS ==========

async function getAISuggestions() {
    if (!authToken) {
        showAuthModal();
        return;
    }

    const section = document.getElementById('aiSection').value;
    const content = document.getElementById('aiContent').value;

    if (!content) {
        alert('Please enter some content');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/ai/suggestions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ section, content })
        });

        const data = await response.json();

        if (data.success) {
            displayAISuggestions(data.suggestions, data.improved);
        }
    } catch (error) {
        console.error('AI suggestions error:', error);
        alert('Failed to get suggestions');
    }
}

function displayAISuggestions(suggestions, improved) {
    const resultsDiv = document.getElementById('aiResults');
    const suggestionsList = document.getElementById('suggestionsList');
    const improvedText = document.getElementById('improvedText');

    suggestionsList.innerHTML = suggestions
        .map(sugg => `<div class="report-item"><p>✓ ${sugg}</p></div>`)
        .join('');

    improvedText.value = improved;
    improvedText.style.display = 'block';
    resultsDiv.style.display = 'block';
}

// ========== UTILITIES ==========

window.toggleForm = toggleForm;
window.showSection = showSection;
window.logout = logout;
window.createNewResume = createNewResume;
window.editResume = editResume;
window.deleteResume = deleteResume;
window.testATS = testATS;
window.getAISuggestions = getAISuggestions;
window.selectPlan = selectPlan;
window.upgradePlan = upgradePlan;
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.saveResume = saveResume;

console.log('✅ CVGenius Pro app loaded successfully!');
