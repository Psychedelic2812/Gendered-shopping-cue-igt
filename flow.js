// Screen flow (version is allocated by the Google Sheet script after the demographics screen): information -> consent -> demographics -> card task -> final questions (IGI, then Short UPPS-P) -> end.
// Uses globals from experiment.js: hasCondition, urlParams, participantId, conditionName, groupName,
// variationName, balance, dataRows, taskStartTime, SHEET_URL.

// ---------- Questionnaire content ----------
const DEMOGRAPHICS = [
    { key: "gender", label: "How do you describe your gender identity?",
      options: ["Man", "Woman", "Non-binary", "Prefer to self-describe", "Prefer not to say"],
      selfDescribe: "Prefer to self-describe" },
    { key: "age", label: "What is your age in completed years?", number: { min: 18, max: 99 } },
    { key: "residenceNow", label: "Which of the following best describes the area where you currently reside?",
      options: ["Rural area / village", "Urban area / city or town"] },
    { key: "residenceChildhood", label: "Which of the following best describes the area where you spent most of your childhood?",
      options: ["Rural area / village", "Urban area / city or town"] },
    { key: "headEducation", label: "What is the highest educational qualification of the head of your family?",
      options: ["Illiterate / no formal schooling", "Primary school", "Middle school", "High school",
                "Higher secondary / intermediate", "Diploma", "Graduate", "Postgraduate",
                "Professional degree", "Prefer not to say / Not sure"] },
    { key: "householdIncome", label: "Approximately what is the total monthly income of your household?",
      options: ["₹3,332 or below", "₹3,333 – ₹9,900", "₹9,901 – ₹16,500", "₹16,501 – ₹24,751",
                "₹24,752 – ₹33,002", "₹33,003 – ₹66,004", "₹66,005 or above", "Prefer not to say"] },
    { key: "householdSize", label: "How many people are currently part of your household, including yourself?",
      number: { min: 1, max: 30 } },
    { key: "marketingExposure", label: "How frequently do you encounter marketing stimuli related to shopping, either online or offline?",
      options: ["Never", "Rarely", "Sometimes", "Often", "Very frequently"] },
    { key: "productFamiliarity", label: "How familiar are you with the types of products commonly encountered in shopping environments?",
      options: ["1 – Not at all familiar", "2 – Slightly familiar", "3 – Moderately familiar",
                "4 – Very familiar", "5 – Extremely familiar"] }
];

// Adapted Immediate Gratification Inventory (all items positively keyed; no reverse scoring)
const IGI_ITEMS = [
    "I find it difficult to stick to healthy eating goals when tempting food is immediately available.",
    "When deciding what to eat, I prioritize immediate taste satisfaction over nutritional value.",
    "I prioritize immediate physical comfort or pleasure, even when it interferes with achieving my goals.",
    "When faced with a physically demanding task, I choose immediate comfort.",
    "I focus on the immediate benefits of my actions without considering how they affect others.",
    "In social situations, I prioritize what feels fun or rewarding right now over how it impacts others in the long run.",
    "I prefer to spend my money on immediate pleasures over saving it.",
    "I tend to make purchases for immediate satisfaction without considering my future financial needs.",
    "When working towards an academic or professional goal, I prefer an easier, immediate option.",
    "I prefer to see the immediate results my efforts are making rather than wait for them to pay off in the long run."
];

// Short UPPS-P (Cyders et al., 2014). Raw answers: 1 = Agree Strongly ... 4 = Disagree Strongly.
// Items in UPPS_REVERSED are reverse scored (1<->4, 2<->3) so that higher always = more impulsive.
const UPPS_ITEMS = [
    "I generally like to see things through to the end.",
    "My thinking is usually careful and purposeful.",
    "When I am in great mood, I tend to get into situations that could cause me problems.",
    "Unfinished tasks really bother me.",
    "I like to stop and think things over before I do them.",
    "When I feel bad, I will often do things I later regret in order to make myself feel better now.",
    "Once I get going on something I hate to stop.",
    "Sometimes when I feel bad, I can\u2019t seem to stop what I am doing even though it is making me feel worse.",
    "I quite enjoy taking risks.",
    "I tend to lose control when I am in a great mood.",
    "I finish what I start.",
    "I tend to value and follow a rational, \"sensible\" approach to things.",
    "When I am upset I often act without thinking.",
    "I welcome new and exciting experiences and sensations, even if they are a little frightening and unconventional.",
    "When I feel rejected, I will often say things that I later regret.",
    "I would like to learn to fly an airplane.",
    "Others are shocked or worried about the things I do when I am feeling very excited.",
    "I would enjoy the sensation of skiing very fast down a high mountain slope.",
    "I usually think carefully before doing anything.",
    "I tend to act without thinking when I am really excited."
];
const UPPS_REVERSED = [3, 6, 8, 9, 10, 13, 14, 15, 16, 17, 18, 20];
const UPPS_SUBSCALES = {
    negativeUrgency:     [6, 8, 13, 15],
    lackPerseverance:    [1, 4, 7, 11],
    lackPremeditation:   [2, 5, 12, 19],
    sensationSeeking:    [9, 14, 16, 18],
    positiveUrgency:     [3, 10, 17, 20]
};

// ---------- Flow state ----------
let consentTimestamp = "";
let demographics = null;
let igi = null;                 // { items: [10 numbers], total }
let upps = null;                // { items: [20 raw answers], subscales: {...}, total }
let taskSeconds = "";

const $ = function (id) { return document.getElementById(id); };
const SCREENS = ["invalid", "info", "consent", "demographics", "task", "igi", "upps", "end"];

function showScreen(name) {
    SCREENS.forEach(function (s) { $("screen-" + s).hidden = (s !== name); });
    window.scrollTo(0, 0);
}

// ---------- Information and consent ----------
$("infoContinue").addEventListener("click", function () { showScreen("consent"); });

const consentBoxes = Array.from(document.querySelectorAll("#consentList input"));
function updateConsentButton() {
    $("consentYes").disabled = !consentBoxes.every(function (b) { return b.checked; });
}
consentBoxes.forEach(function (b) { b.addEventListener("change", updateConsentButton); });

$("consentYes").addEventListener("click", function () {
    consentTimestamp = new Date().toISOString();
    showScreen("demographics");
});

$("consentNo").addEventListener("click", function () {
    $("endTitle").textContent = "Thank you for your time";
    $("endText").textContent = "You chose not to take part, so nothing has been recorded. You may now close this window.";
    showScreen("end");
});

// ---------- Automatic allocation (done by the Google Sheet script, so it balances across all devices) ----------
// Woman -> V2 (female cues), Man -> V1 (male cues). Any other answer goes to whichever variation
// has fewer participants (these participants are removed in data cleaning).
// Within each variation the group alternates G1, G2, G1, G2... The server keeps the counts.
function allocateCondition(gender) {
    if (!SHEET_URL) return Promise.reject(new Error("SHEET_URL is not set"));
    const url = SHEET_URL + "?action=allocate&pid=" + encodeURIComponent(participantId) +
                "&gender=" + encodeURIComponent(gender);
    return fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (!res.ok || !CONDITIONS[res.condition]) throw new Error(res.error || "Unexpected reply");
            return res.condition;
        });
}

// ---------- Demographics ----------
function buildDemographics() {
    const box = $("demographicsFields");
    let html = "";

    // Participant ID is asked only when the researcher's link did not already include one
    if (!urlParams.get("pid")) {
        html += '<fieldset class="q"><legend>Participant ID (optional)</legend>' +
                '<p class="hint">Write a pseudo (or false) name, or leave this blank and one will be generated for you.</p>' +
                '<input type="text" id="pidInput" maxlength="30" autocomplete="off"></fieldset>';
    }

    DEMOGRAPHICS.forEach(function (q) {
        html += '<fieldset class="q" data-key="' + q.key + '"><legend>' + q.label + '</legend>';
        if (q.options) {
            html += '<div class="options">';
            q.options.forEach(function (opt) {
                html += '<label class="opt"><input type="radio" name="' + q.key + '" value="' + opt + '"><span>' + opt + '</span></label>';
            });
            html += '</div>';
            if (q.selfDescribe) {
                html += '<input type="text" id="' + q.key + 'Other" class="other" maxlength="60" ' +
                        'placeholder="Please write how you describe yourself" hidden>';
            }
        } else {
            html += '<input type="number" inputmode="numeric" id="' + q.key + 'Input" min="' + q.number.min +
                    '" max="' + q.number.max + '" step="1">';
        }
        html += '</fieldset>';
    });
    box.innerHTML = html;

    // Show the text box only when "Prefer to self-describe" is chosen
    document.querySelectorAll('input[name="gender"]').forEach(function (r) {
        r.addEventListener("change", function () {
            const other = $("genderOther");
            other.hidden = (r.value !== "Prefer to self-describe" || !r.checked);
            if (!other.hidden) other.focus();
        });
    });
}

$("demographicsForm").addEventListener("submit", function (event) {
    event.preventDefault();
    const answers = {};
    const missing = [];

    DEMOGRAPHICS.forEach(function (q) {
        if (q.options) {
            const picked = document.querySelector('input[name="' + q.key + '"]:checked');
            if (!picked) { missing.push(q.label); return; }
            answers[q.key] = picked.value;
            if (q.selfDescribe) {
                const text = $(q.key + "Other").value.trim();
                if (picked.value === q.selfDescribe && !text) { missing.push(q.label + " (please write your answer)"); return; }
                answers[q.key + "SelfDescribe"] = (picked.value === q.selfDescribe) ? text : "";
            }
        } else {
            const raw = $(q.key + "Input").value.trim();
            const value = Number(raw);
            if (raw === "" || !Number.isInteger(value) || value < q.number.min || value > q.number.max) {
                missing.push(q.label + " (a whole number from " + q.number.min + " to " + q.number.max + ")");
                return;
            }
            answers[q.key] = value;
        }
    });

    const error = $("demographicsError");
    if (missing.length) {
        error.textContent = "Please complete: " + missing.join("  |  ");
        error.hidden = false;
        return;
    }
    error.hidden = true;

    const pidInput = $("pidInput");
    if (pidInput && pidInput.value.trim()) participantId = pidInput.value.trim();

    demographics = answers;
    if (CONDITIONS[forcedCondition]) { showScreen("task"); return; }   // test link: version already fixed

    const button = $("demographicsContinue");
    button.disabled = true;
    button.textContent = "Please wait...";
    allocateCondition(answers.gender)
        .then(function (name) {
            applyCondition(name);
            showScreen("task");
        })
        .catch(function (err) {
            console.error("Allocation failed:", err);
            error.textContent = "Could not reach the study server. Please check the internet connection and press Continue again.";
            error.hidden = false;
        })
        .then(function () {
            button.disabled = false;
            button.textContent = "Continue";
        });
});

// ---------- End of the card task ----------
function onTaskFinished() {
    taskSeconds = Math.round((Date.now() - taskStartTime) / 1000);
    sendData();                                   // early save of the card-task data
    const button = $("continueButton");
    button.hidden = false;
    button.onclick = function () { showScreen("igi"); };
}

// ---------- IGI ----------
function buildIGI() {
    let html = "";
    IGI_ITEMS.forEach(function (text, i) {
        const n = i + 1;
        html += '<fieldset class="q likert"><legend>' + n + '. ' + text + '</legend><div class="scale">';
        for (let v = 1; v <= 5; v++) {
            html += '<label><input type="radio" name="igi' + n + '" value="' + v + '"><span>' + v + '</span></label>';
        }
        html += '</div><div class="anchors"><small>Strongly Disagree</small><small>Strongly Agree</small></div></fieldset>';
    });
    $("igiItems").innerHTML = html;
}

$("igiForm").addEventListener("submit", function (event) {
    event.preventDefault();
    const items = [];
    const unanswered = [];
    for (let n = 1; n <= IGI_ITEMS.length; n++) {
        const picked = document.querySelector('input[name="igi' + n + '"]:checked');
        if (picked) items.push(Number(picked.value)); else unanswered.push(n);
    }
    const error = $("igiError");
    if (unanswered.length) {
        error.textContent = "Please answer statement" + (unanswered.length > 1 ? "s " : " ") + unanswered.join(", ") + ".";
        error.hidden = false;
        return;
    }
    error.hidden = true;

    // Scoring: direct sum of all 10 items (range 10-50); higher = stronger preference for immediate gratification
    const total = items.reduce(function (a, b) { return a + b; }, 0);
    igi = { items: items, total: total };

    showScreen("upps");
    sendData();                                   // save progress (card task + demographics + IGI)
});

// ---------- Short UPPS-P ----------
function buildUPPS() {
    let html = "";
    UPPS_ITEMS.forEach(function (text, i) {
        const n = i + 1;
        html += '<fieldset class="q likert"><legend>' + n + '. ' + text + '</legend><div class="scale">';
        for (let v = 1; v <= 4; v++) {
            html += '<label><input type="radio" name="upps' + n + '" value="' + v + '"><span>' + v + '</span></label>';
        }
        html += '</div><div class="anchors"><small>Agree Strongly</small><small>Disagree Strongly</small></div></fieldset>';
    });
    $("uppsItems").innerHTML = html;
}

// Reverse-score the (R) items, then add up each subscale (4 items, range 4-16) and the total (range 20-80).
// Higher = more impulsive.
function scoreUPPS(rawItems) {
    const scored = rawItems.map(function (v, i) { return UPPS_REVERSED.indexOf(i + 1) !== -1 ? 5 - v : v; });
    const subscales = {};
    Object.keys(UPPS_SUBSCALES).forEach(function (name) {
        subscales[name] = UPPS_SUBSCALES[name].reduce(function (sum, n) { return sum + scored[n - 1]; }, 0);
    });
    const total = scored.reduce(function (a, b) { return a + b; }, 0);
    return { items: rawItems, subscales: subscales, total: total };
}

$("uppsForm").addEventListener("submit", function (event) {
    event.preventDefault();
    const items = [];
    const unanswered = [];
    for (let n = 1; n <= UPPS_ITEMS.length; n++) {
        const picked = document.querySelector('input[name="upps' + n + '"]:checked');
        if (picked) items.push(Number(picked.value)); else unanswered.push(n);
    }
    const error = $("uppsError");
    if (unanswered.length) {
        error.textContent = "Please answer statement" + (unanswered.length > 1 ? "s " : " ") + unanswered.join(", ") + ".";
        error.hidden = false;
        return;
    }
    error.hidden = true;

    upps = scoreUPPS(items);

    $("endTitle").textContent = "Thank you!";
    $("endText").textContent = "You have completed the study. Please let the researcher know you have finished.";
    showScreen("end");
    sendData();
});

// ---------- Saving ----------
function buildPayload() {
    return {
        participant: participantId,
        condition: conditionName,
        group: groupName,
        variation: variationName,
        finalBalance: balance,
        sessionSeconds: taskSeconds,
        consentTimestamp: consentTimestamp,
        demographics: demographics,
        igi: igi,
        upps: upps,
        rows: dataRows
    };
}

function setSaveStatus(text) { $("saveStatus").textContent = text; }

// Each call sends everything collected so far; the sheet replaces the earlier upload for the same
// participant and condition, so retries never create duplicates.
function sendData() {
    try { localStorage.setItem("igt_full_backup_" + participantId, JSON.stringify(buildPayload())); } catch (e) {}
    if (!SHEET_URL) { if (upps) showSaveFailure(); return; }
    if (upps) setSaveStatus("Saving your responses...");
    fetch(SHEET_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },   // avoids a CORS preflight
        body: JSON.stringify(buildPayload())
    })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (!res.ok) throw new Error(res.error || "Unknown error");
            if (upps) {
                setSaveStatus("Your responses have been saved.");
                $("retryButton").hidden = true;
                $("backupButton").hidden = true;
            }
        })
        .catch(function (err) {
            console.error("Upload failed:", err);
            if (upps) showSaveFailure();
        });
}

function showSaveFailure() {
    setSaveStatus("Your responses could not be saved automatically. Please tell the researcher.");
    $("retryButton").hidden = false;
    $("backupButton").hidden = false;
}

$("retryButton").addEventListener("click", sendData);

// Backup CSV: one row per trial, with the questionnaire answers repeated on every row
function csvCell(value) {
    const text = (value === null || value === undefined) ? "" : String(value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

$("backupButton").addEventListener("click", function () {
    if (!dataRows.length) return;
    const extra = Object.assign({}, demographics || {}, { consentTimestamp: consentTimestamp });
    if (igi) {
        igi.items.forEach(function (v, i) { extra["IGI_" + (i + 1)] = v; });
        extra.IGI_total = igi.total;
    }
    if (upps) {
        upps.items.forEach(function (v, i) { extra["UPPS_" + (i + 1)] = v; });
        extra.UPPS_negativeUrgency = upps.subscales.negativeUrgency;
        extra.UPPS_lackPerseverance = upps.subscales.lackPerseverance;
        extra.UPPS_lackPremeditation = upps.subscales.lackPremeditation;
        extra.UPPS_sensationSeeking = upps.subscales.sensationSeeking;
        extra.UPPS_positiveUrgency = upps.subscales.positiveUrgency;
        extra.UPPS_total = upps.total;
    }
    const rows = dataRows.map(function (r) { return Object.assign({}, r, extra); });
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(",")];
    rows.forEach(function (row) {
        lines.push(headers.map(function (h) { return csvCell(row[h]); }).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "igt_" + participantId + "_" + conditionName + ".csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// ---------- Start ----------
buildDemographics();
buildIGI();
buildUPPS();
showScreen(hasCondition ? "info" : "invalid");