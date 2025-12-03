/**
 * script.js — GenAI Studio frontend
 *
 * Implements all frontend logic: theme, history, file handling, API calls, and result rendering.
 * FIXES: Ensures history entries are separate, enforces correct rendering for complexity (Markdown table), 
 * and implements the "Analysis Complete" notification.
 */

/* ============================
	CONFIG
	============================ */
const API_BASE = "http://127.0.0.1:5000"; // Backend endpoint
const HISTORY_KEY = "genai_analysis_history_v1";
const THEME_KEY = "genai_theme_v1";

/* ============================
	DOM CACHE (defensive)
	============================ */
const el = (id) => document.getElementById(id);

const promptEl = el("prompt");
const charCountEl = el("charCount");
const fileInputEl = el("fileInput");
const fileListEl = el("fileList");
const modelSelectEl = el("modelSelect");

const evaluateBtn = el("evaluateBtn"); 
const clearBtn = el("clearBtn");
const formatBtn = el("formatBtn");
const suggestBtn = el("suggestBtn");

const clearTemplatesBtn = el("clearTemplates");
const templateCards = document.querySelectorAll(".template-card");

const historyListEl = el("historyList");

const tabs = document.querySelectorAll(".tab");
const tabContentEls = document.querySelectorAll(".tab-content");

const loadingEl = el("loading") || { classList: { add: () => {}, remove: () => {} } };

const themeToggleBtn = el("themeToggle");

const exportBtn = el("exportBtn");
const shareBtn = el("shareBtn");

// Content containers
let explanationEl = el("explanation");
let codeEl = el("code");
let complexityEl = el("complexity");
let suggestionsEl = el("suggestions");

/* ============================
	UTILITIES
	============================ */
function safeLog(...args) {
	try { console.log(...args); } catch (e) {}
}

function qsa(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }

/* Toast system (Notification) */
(function installToastStyles() {
	if (document.getElementById("__genai_toast_styles")) return;
	const s = document.createElement("style");
	s.id = "__genai_toast_styles";
	s.innerHTML = `
		.genai-toast {
			position: fixed;
			top: 20px;
			right: 20px;
			background: var(--bg-card, #fff);
			color: var(--text-primary, #111);
			border: 1px solid var(--border, #e6e6e6);
			padding: 10px 14px;
			border-radius: 10px;
			box-shadow: 0 8px 28px rgba(0,0,0,0.08);
			z-index: 99999;
			transform: translateX(200%);
			opacity: 0;
			transition: transform 260ms cubic-bezier(.2,.9,.2,1), opacity 260ms ease;
			font-weight: 700;
			min-width: 160px;
			cursor: pointer;
		}
		.genai-toast.show { transform: translateX(0); opacity: 1; }
		.genai-toast.info { border-left: 6px solid var(--primary, #2962ff); }
		.genai-toast.success { border-left: 6px solid #16a34a; }
		.genai-toast.error { border-left: 6px solid #dc2626; }
	`;
	document.head.appendChild(s);
})();

function toast(message = "", type = "info", ttl = 3000) {
	try {
		const t = document.createElement("div");
		t.className = `genai-toast ${type}`;
		t.innerText = message;
		document.body.appendChild(t);
		
		const timer = setTimeout(() => {
			t.classList.remove("show");
			setTimeout(() => t.remove(), 280);
		}, ttl);
		
		// Dismiss on click and clear auto-dismiss (FIX: Notification dismiss)
		t.addEventListener("click", () => {
			t.classList.remove("show");
			clearTimeout(timer);
			setTimeout(() => t.remove(), 280);
		}, { once: true });


		requestAnimationFrame(() => t.classList.add("show"));
	} catch (e) { safeLog("toast error", e); }
}

/* Helpers for localStorage */
function saveToLS(key, obj) {
	try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
}
function loadFromLS(key, fallback = null) {
	try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}

/* ============================
	THEME HANDLING
	============================ */
function applySavedTheme() {
	const saved = loadFromLS(THEME_KEY, null) || "light";
	document.body.setAttribute("data-theme", saved);
}
applySavedTheme();

if (themeToggleBtn) {
	themeToggleBtn.addEventListener("click", () => {
		const cur = document.body.getAttribute("data-theme") || "light";
		const next = cur === "light" ? "dark" : "light";
		document.body.setAttribute("data-theme", next);
		saveToLS(THEME_KEY, next);
		toast(`${next === "dark" ? "Dark" : "Light"} mode enabled`, "info", 1200);
	});
}

/* ============================
	HISTORY (recent analyses)
	============================ */
function pushHistory(item) {
	if (!item || typeof item !== "string") return;
	let arr = loadFromLS(HISTORY_KEY, []);
	// dedupe identical exact prompts
	arr = arr.filter(x => x !== item);
	arr.unshift(item);
	if (arr.length > 12) arr = arr.slice(0, 12);
	saveToLS(HISTORY_KEY, arr);
	renderHistory();
}

function renderHistory() {
	if (!historyListEl) return;
	historyListEl.innerHTML = "";
	const arr = loadFromLS(HISTORY_KEY, []);
	if (!arr || arr.length === 0) {
		const ph = document.createElement("div");
		ph.className = "no-history";
		ph.innerText = "No analyses yet";
		historyListEl.appendChild(ph);
		return;
	}
	// FIX: Ensure each search appears in a separate, selectable cell
	arr.forEach((entry) => {
		const d = document.createElement("div");
		d.className = "history-entry";
		const displayTxt = entry.length > 50 ? entry.slice(0, 50).trim() + "…" : entry;
		d.textContent = displayTxt;
		d.title = entry;
		d.addEventListener("click", () => {
			if (promptEl) { promptEl.value = entry; updateCharCount(); }
			toast("Loaded from history", "info", 900);
		});
		historyListEl.appendChild(d);
	});
}
renderHistory();

/* ============================
	TABS
	============================ */
function activateTab(name) {
	if (!tabs || !tabContentEls) return;
	tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
	tabContentEls.forEach(c => c.classList.toggle("active", c.id === name));
}
tabs.forEach(t => {
	t.addEventListener("click", () => {
		const name = t.dataset.tab;
		if (!name) return;
		activateTab(name);
	});
});

/* ============================
	CHAR COUNT & FORMATTING
	============================ */
function updateCharCount() {
	if (!charCountEl || !promptEl) return;
	charCountEl.textContent = `${promptEl.value.length} characters`;
}
if (promptEl && charCountEl) {
	promptEl.addEventListener("input", updateCharCount);
	updateCharCount();
}

if (formatBtn && promptEl) {
	formatBtn.addEventListener("click", () => {
		let text = promptEl.value || "";
		text = text.replace(/\r\n/g, "\n");
		text = text.replace(/\n{3,}/g, "\n\n");
		text = text.split("\n").map(line => line.replace(/\s+$/g, "")).join("\n");
		text = text.trim();
		promptEl.value = text;
		updateCharCount();
		toast("Formatted input", "success", 900);
	});
}

/* Suggest button (lightweight suggestions) */
if (suggestBtn) {
	suggestBtn.addEventListener("click", () => {
		const content = promptEl ? promptEl.value.trim() : "";
		if (!content) { toast("Enter something first", "error", 1100); return; }
		const suggestions = [];
		if (content.length < 40) suggestions.push("Add more problem context (datasets, assumptions).");
		if (!/interest|rate|i|%/i.test(content)) suggestions.push("Specify interest rate (i) if required for actuarial calculations.");
		if (!/mortality|qx|lx|life table|table/i.test(content)) suggestions.push("If using mortality data, attach the mortality table as CSV or text.");
		if (suggestions.length === 0) suggestions.push("Looks good — consider attaching sample data for precise results.");

		const target = suggestionsEl; 
		if (target) {
			// FIX: Ensure suggestions are rendered as safe Markdown, no $ symbols
			target.innerHTML = marked.parse(`**Quick Suggestions:**\n\n- ${suggestions.join('\n- ')}`);
			activateTab("suggestions");
		}
		toast("Suggestions generated", "success", 900);
	});
}

/* ============================
	TEMPLATES (actuarial)
	============================ */
const TEMPLATES = {
	nsp:
`# Net Single Premium (NSP) - simple example (Python)
# i = interest rate, qx = dictionary of mortality probabilities (qx[x] = q_x)
def v(i, k):
	return 1.0 / ((1.0 + i) ** k)

def net_single_premium(i, x, n, qx):
	# calculates EPV of a benefit of 1 payable at moment of death within n years
	epv = 0.0
	px = 1.0
	for k in range(1, n+1):
		q_at = qx.get(x + k - 1, 0.0)
		epv += (v(i, k) * px * q_at)
		px *= (1 - q_at)
	return epv
`,
	annuity:
`# Present value of an annuity-immediate (example)
i = 0.05
n = 10
v = lambda k: 1.0 / ((1 + i) ** k)
annuity_immediate = sum(v(k) for k in range(1, n+1))
print("Annuity immediate PV:", annuity_immediate)
`,
	mortality:
`# Mortality table example (dictionary)
qx = {30: 0.0012, 31: 0.0013, 32: 0.0014}
def survival_prob(age_from, age_to, qx):
	p = 1.0
	for a in range(age_from, age_to):
		p *= (1 - qx.get(a, 0.0))
	return p
print("Survival 30->33:", survival_prob(30, 33, qx))
`,
	ibnr:
`# Chain Ladder (simplified illustration - Python)
triangle = [
	[120, 200, 250],
	[100, 180, None],
	[90, None, None]
]
# compute development factors (basic)
# (This is a starting template; attach CSV for realistic analysis)
`
};

templateCards.forEach(card => {
	card.addEventListener("click", () => {
		const key = card.dataset.template;
		const txt = TEMPLATES[key] || "";
		if (!promptEl) return;
		promptEl.value = txt;
		updateCharCount();
		toast(`Loaded template: ${card.textContent.trim()}`, "success", 900);
	});
});

/* Clear templates / clear input */
if (clearTemplatesBtn && promptEl) {
	clearTemplatesBtn.addEventListener("click", () => {
		promptEl.value = "";
		updateCharCount();
		toast("Input cleared", "info", 700);
	});
}

/* ============================
	FILE UPLOAD UI
	============================ */
function renderFileList() {
	if (!fileListEl || !fileInputEl) return;
	fileListEl.innerHTML = "";
	const files = fileInputEl.files ? Array.from(fileInputEl.files) : [];
	if (files.length === 0) return;
	files.forEach((f) => {
		const item = document.createElement("div");
		item.className = "file-item";
		item.style.border = "1px solid var(--border)";
		item.style.padding = "6px 10px";
		item.style.borderRadius = "8px";
		item.style.display = "inline-flex";
		item.style.alignItems = "center";
		item.style.gap = "8px";
		item.style.marginRight = "8px";
		item.innerHTML = `<i class="fa-regular fa-file" style="color:var(--primary)"></i>
						 <span style="font-weight:600">${escapeHtml(f.name)}</span>
						 <button class="remove-file-btn" title="Remove" style="border:none;background:transparent;cursor:pointer;color:var(--text-muted);font-weight:700">✕</button>`;
		item.querySelector(".remove-file-btn").addEventListener("click", () => {
			removeFileByName(f.name);
		});
		fileListEl.appendChild(item);
	});
}

function removeFileByName(name) {
	if (!fileInputEl) return;
	const dt = new DataTransfer();
	Array.from(fileInputEl.files || []).forEach(f => {
		if (f.name !== name) dt.items.add(f);
	});
	fileInputEl.files = dt.files;
	renderFileList();
}

if (fileInputEl) {
	fileInputEl.addEventListener("change", () => {
		renderFileList();
	});
}

/* ============================
	EXPORT & SHARE
	============================ */
if (exportBtn) {
	exportBtn.addEventListener("click", () => {
		const activeTab = document.querySelector(".tab.active")?.dataset.tab || "explanation";
		const contentEl = document.getElementById(activeTab);
		if (!contentEl) { toast("Nothing to export", "error"); return; }
		const data = contentEl.innerText || contentEl.textContent || "";
		if (!data.trim()) { toast("No content to export", "error"); return; }
		const blob = new Blob([data], { type: "text/plain;charset=utf-8" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `genai-${activeTab}-${new Date().toISOString().slice(0,10)}.txt`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(a.href);
		toast("Exported", "success");
	});
}

if (shareBtn) {
	shareBtn.addEventListener("click", async () => {
		const activeTab = document.querySelector(".tab.active")?.dataset.tab || "explanation";
		const contentEl = document.getElementById(activeTab);
		if (!contentEl) { toast("No content to share", "error"); return; }
		const text = contentEl.innerText || contentEl.textContent || "";
		if (!text.trim()) { toast("No content to share", "error"); return; }
		try {
			// Using document.execCommand('copy') for compatibility in iFrames
			const ta = document.createElement("textarea");
			ta.value = text;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			ta.remove();
			toast("Copied to clipboard", "success");
		} catch (e) {
			toast("Copy failed", "error");
		}
	});
}

/* ============================
	RUN ANALYSIS (core)
	============================ */
async function runAnalysis() {
	if (!promptEl) { toast("Internal error: missing prompt input", "error"); return; }
	const prompt = promptEl.value.trim();
	if (!prompt) {
		toast("Please enter a prompt", "error");
		return;
	}

	// build formdata
	const fd = new FormData();
	fd.append("prompt", prompt);
	if (modelSelectEl) fd.append("model", modelSelectEl.value || "");

	if (fileInputEl && fileInputEl.files && fileInputEl.files.length) {
		Array.from(fileInputEl.files).forEach(f => fd.append("files", f));
	}

	try {
		// show loading
		loadingEl && loadingEl.classList && loadingEl.classList.remove("hidden");
		if (evaluateBtn) { evaluateBtn.disabled = true; evaluateBtn.classList.add("disabled"); }

		const res = await fetch(`${API_BASE}/analyze`, {
			method: "POST",
			body: fd,
		});

		if (!res.ok) {
			let errText = `Server responded ${res.status}`;
			try {
				const j = await res.json();
				errText = j.error || j.message || errText;
			} catch (e) {}
			toast(errText, "error", 3500);
			return;
		}

		const data = await res.json();
		if (!data || !data.content) {
			toast("Empty response from server", "error");
			return;
		}

		// The backend returns a string with four sections
		const full = data.content || "";
		const parsed = parseSections(full);

		// Render Explanation (uses Markdown parsing)
		if (explanationEl) {
			try {
				explanationEl.innerHTML = parsed["Explanation"] ? marked.parse(parsed["Explanation"]) : "<em>No explanation provided.</em>";
			} catch (e) {
				explanationEl.textContent = parsed["Explanation"] || full;
			}
		}
		
		// Render Code (plain text)
		if (codeEl) {
			codeEl.textContent = parsed["Code"] || parsed["code"] || "";
		}
		
		// Render Complexity (uses Markdown parsing for the table, since $ is forbidden)
		if (complexityEl) {
			const complexityContent = parsed["Time & Space Complexity"] || parsed["Complexity"] || "No Complexity Analysis Provided.";
			try {
				complexityEl.innerHTML = marked.parse(complexityContent);
			} catch(e) {
				complexityEl.textContent = complexityContent;
			}
		}
		
		// Render Suggestions (uses Markdown parsing, $ is forbidden by prompt)
		if (suggestionsEl) {
			const suggestionsContent = parsed["Suggestions"] || "<em>No suggestions.</em>";
			try {
				suggestionsEl.innerHTML = marked.parse(suggestionsContent);
			} catch(e) {
				suggestionsEl.textContent = suggestionsContent;
			}
		}

		// Update indicator metrics (populated by the Python backend)
		if (data.metrics) {
			const q = data.metrics.quality; const c = data.metrics.complexity; const s = data.metrics.security;
			if (el("qualityScore")) el("qualityScore").textContent = q || "-";
			if (el("complexityScore")) el("complexityScore").textContent = c || "-";
			if (el("securityScore")) el("securityScore").textContent = s || "-";
		} else {
			// Reset scores if no metrics are returned
			if (el("qualityScore")) el("qualityScore").textContent = "-";
			if (el("complexityScore")) el("complexityScore").textContent = "-";
			if (el("securityScore")) el("securityScore").textContent = "-";
		}

		// push to history
		pushHistory(prompt);

		// show explanation tab
		activateTab("explanation");
		// Success notification
		toast("Analysis complete", "success", 1200); 
	} catch (err) {
		safeLog("runAnalysis error", err);
		toast("Network or server error. See console.", "error", 3000);
	} finally {
		// hide loading and re-enable
		loadingEl && loadingEl.classList && loadingEl.classList.add("hidden");
		if (evaluateBtn) { evaluateBtn.disabled = false; evaluateBtn.classList.remove("disabled"); }
	}
}

function parseSections(text) {
	// Robust section parser looking for "### Section" headings
	const result = {};
	const t = (text || "").replace(/\r\n/g, "\n");
	
	// Use regex to find and split by the specific Markdown headings (###)
	const parts = t.split(/^(###\s+[^\n]+)/m).filter(Boolean);
	
	let currentHeader = null;
	for(const part of parts) {
		if (part.startsWith("###")) {
			// Extract header name, normalize for lookup
			currentHeader = part.replace(/^###\s+/, '').trim();
			// Normalize complexity name for internal JS lookup
			if (currentHeader.includes("Complexity")) currentHeader = "Time & Space Complexity";
			result[currentHeader] = "";
		} else if (currentHeader) {
			// Append content to the current section
			result[currentHeader] += part.trim();
		}
	}
	
	// Fallback for unexpected format
	if (!Object.keys(result).length) {
		result["Explanation"] = t;
	}

	return result;
}

/* Attach run action */
if (evaluateBtn) {
	evaluateBtn.addEventListener("click", runAnalysis);
}

/* Clear button */
if (clearBtn) {
	clearBtn.addEventListener("click", () => {
		if (promptEl) promptEl.value = "";
		if (fileInputEl) { fileInputEl.value = ""; renderFileList(); }
		if (explanationEl) explanationEl.innerHTML = "";
		if (codeEl) codeEl.textContent = "";
		if (complexityEl) complexityEl.textContent = "";
		if (suggestionsEl) suggestionsEl.textContent = "";
		
		// Reset indicator scores
		if (el("qualityScore")) el("qualityScore").textContent = "-";
		if (el("complexityScore")) el("complexityScore").textContent = "-";
		if (el("securityScore")) el("securityScore").textContent = "-";

		updateCharCount();
		toast("Cleared all", "info", 900);
	});
}

/* Keyboard shortcut Ctrl+Enter to run */
document.addEventListener("keydown", (ev) => {
	if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
		if (document.activeElement && document.activeElement.tagName === "TEXTAREA") {
			ev.preventDefault();
			runAnalysis();
		}
	}
});

/* ============================
	MISC HELPERS
	============================ */
function escapeHtml(s) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/* ============================
	INITIALIZE / hydration
	============================ */
(function init() {
	updateCharCount();
	renderFileList();
	renderHistory();

	// handle collapsible sections in sidebar
	qsa(".collapsible").forEach(header => {
		header.addEventListener("click", () => {
			header.classList.toggle("active");
			const next = header.nextElementSibling;
			if (next) {
				const isOpen = header.classList.contains("active");
				// Updated height calculation for smooth transition
				if (isOpen) next.style.maxHeight = (next.scrollHeight + 20) + "px"; 
				else next.style.maxHeight = "0px";
			}
		});
	});

	// Initial score reset
	if (el("qualityScore")) el("qualityScore").textContent = "-";
	if (el("complexityScore")) el("complexityScore").textContent = "-";
	if (el("securityScore")) el("securityScore").textContent = "-";
	
	// Activate default tab
	const activeName = document.querySelector(".tab.active")?.dataset.tab || "explanation";
	activateTab(activeName);
})();

/* ============================
	END
	============================ */
