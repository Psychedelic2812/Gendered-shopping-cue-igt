// ---------- Settings (start 50,000; amounts scaled from the original and rounded to the nearest hundred) ----------
const START_AMOUNT = 50000;
const TOTAL_BLOCKS = 6;          // 6 blocks x 20 trials = 120 trials
const TRIALS_PER_BLOCK = 20;
const DECISION_TIME = 4000;      // 4 seconds; no response = Pass
const FEEDBACK_TIME = 1500;      // how long the result is shown (the picture stays visible too)
const IMAGES_PER_DECK = 30;

const SHEET_URL = "https://script.google.com/macros/s/AKfycbyJ4h-CdeczhPZWKx0isiOP_u7frQhdRgKbQZt7vlOrOQKxkffJAtaLQ1hiQGWJiIAz/exec";

const IMAGE_ROOT = "assets";     // folder that holds shopping_male, shopping_female, neutral
const IMAGE_EXTENSION = "png";   // your pictures are .png

// Image shown on the three non-target decks. The target deck shows its cue picture instead.
const CARD_BACK = IMAGE_ROOT + "/card_back." + IMAGE_EXTENSION;

// true  = always show labelled placeholders, even if the pictures exist (for testing the design)
// false = show real pictures, and a placeholder only where a picture is missing
const FORCE_PLACEHOLDERS = false;

// The cue picture is now shown BEFORE the participant decides, so every
// targeted deck advances to its next picture whether the participant plays,
// passes or times out. (Each deck is targeted 30 times = its 30 pictures.)

const GAINS = { 1: 2500, 2: 2500, 3: 1300, 4: 1300 };
const FORCED_WINS = { 1: 2, 2: 9, 3: 12, 4: 9 };           // first plays with no loss
const LOSS_ITEMS = {
    1: [0, 0, 0, 0, 0, 3800, 5000, 6300, 7500, 8800],
    2: [0, 0, 0, 0, 0, 0, 0, 0, 0, 31300],
    3: [0, 0, 0, 0, 0, 1300, 1300, 1900, 1900, 1900],
    4: [0, 0, 0, 0, 0, 0, 0, 0, 0, 6300]
};

// Decks 1 and 2 are the bad decks; decks 3 and 4 are the good decks
const DECK_TYPE = { 1: "disadvantageous", 2: "disadvantageous", 3: "advantageous", 4: "advantageous" };

// ---------- Picture sets ----------
function pad2(n) { return (n < 10 ? "0" : "") + n; }

function fileList(folder, prefix, from, to) {
    const list = [];
    for (let n = from; n <= to; n++) {
        list.push(IMAGE_ROOT + "/" + folder + "/" + prefix + pad2(n) + "." + IMAGE_EXTENSION);
    }
    return list;
}

// Each set is split into two groups of 30 (one group per deck)
const CUE_POOLS = {
    male:    [fileList("shopping_male", "m", 1, 30),    fileList("shopping_male", "m", 31, 60)],
    female:  [fileList("shopping_female", "f", 1, 30),  fileList("shopping_female", "f", 31, 60)],
    neutral: [fileList("neutral", "n", 1, 30),          fileList("neutral", "n", 31, 60)]
};

const TYPE_LABELS = {
    shopping_male: "Male shopping cue",
    shopping_female: "Female shopping cue",
    neutral: "Neutral image"
};

// Which decks get shopping pictures, and which gender, in each version
const CONDITIONS = {
    G1V1: { cue: "male",   shoppingDecks: [3, 4] },   // Group 1, male cues on good decks
    G1V2: { cue: "female", shoppingDecks: [3, 4] },   // Group 1, female cues on good decks
    G2V1: { cue: "male",   shoppingDecks: [1, 2] },   // Group 2, male cues on bad decks
    G2V2: { cue: "female", shoppingDecks: [1, 2] }    // Group 2, female cues on bad decks
};

// The version (condition) is now chosen automatically in flow.js, from the gender answer on the
// demographics screen. For testing only, a link such as index.html?condition=G2V1&pid=TEST01
// forces one version (and is not counted in the researcher page's totals).
const urlParams = new URLSearchParams(window.location.search);
const hasCondition = true;     // participants no longer need a personal link
const forcedCondition = (urlParams.get("condition") || "").toUpperCase();

let conditionName = CONDITIONS[forcedCondition] ? forcedCondition : "G1V1";
let condition = CONDITIONS[conditionName];
let groupName = conditionName.substring(0, 2);       // G1 or G2
let variationName = conditionName.substring(2);      // V1 or V2
let participantId = urlParams.get("pid") || ("P" + Math.floor(100000 + Math.random() * 900000));

// ---------- Page elements ----------
const deckBoxes = document.querySelectorAll(".deck");
const trialDisplay = document.getElementById("trialNumber");
const balanceDisplay = document.getElementById("balance");
const messageDisplay = document.getElementById("previewMessage");
const instructionsText = document.getElementById("instructionsText");
const startButton = document.getElementById("startButton");
const playButton = document.getElementById("playButton");
const passButton = document.getElementById("passButton");

// Touch devices (phones, tablets) have no A / L keys, so show tap wording instead
const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
if (isTouchDevice) {
    playButton.textContent = "Play";
    passButton.textContent = "Pass";
}

// ---------- Game state ----------
let sequence = [];
let trialIndex = 0;
let balance = START_AMOUNT;
let acceptingResponse = false;
let timer = null;
let trialStartTime = 0;
let forcedLeft = Object.assign({}, FORCED_WINS);
let lossPools = { 1: [], 2: [], 3: [], 4: [] };
let imageCount = { 1: 0, 2: 0, 3: 0, 4: 0 };   // pictures used so far, per deck
let deckImages = {};                            // the 30 pictures for each deck
let deckImageType = {};                         // shopping_male / shopping_female / neutral, per deck
let dataRows = [];                              // one row per trial, for the CSV
let cumulativeDecisionMs = 0;                   // running total of decision time
let taskStartTime = 0;                          // when the participant pressed Start

// ---------- Helpers ----------
function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function formatMoney(amount) {
    const sign = amount < 0 ? "-" : "";
    return sign + "₹" + Math.abs(amount).toLocaleString("en-IN");
}

function nextLoss(deck) {
    if (lossPools[deck].length === 0) {
        lossPools[deck] = shuffle(LOSS_ITEMS[deck]);
    }
    return lossPools[deck].pop();
}

function buildSequence() {
    // Each block of 20: every deck appears 5 times, in random order
    let result = [];
    for (let b = 0; b < TOTAL_BLOCKS; b++) {
        const block = [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4];
        result = result.concat(shuffle(block));
    }
    return result;
}

function setButtonsEnabled(enabled) {
    playButton.disabled = !enabled;
    passButton.disabled = !enabled;
}

// ---------- Assigning pictures to decks ----------
function assignImages() {
    const neutralDecks = [1, 2, 3, 4].filter(function (d) {
        return condition.shoppingDecks.indexOf(d) === -1;
    });

    // Shopping decks get the shopping pictures; the others get neutral pictures.
    // Each deck gets its own 30 pictures, shuffled once, and each is used exactly once.
    condition.shoppingDecks.forEach(function (deck, i) {
        deckImages[deck] = shuffle(CUE_POOLS[condition.cue][i]);
        deckImageType[deck] = "shopping_" + condition.cue;
    });
    neutralDecks.forEach(function (deck, i) {
        deckImages[deck] = shuffle(CUE_POOLS.neutral[i]);
        deckImageType[deck] = "neutral";
    });
}

function checkAndPreloadImages() {
    const all = [];
    for (let d = 1; d <= 4; d++) {
        if (deckImages[d].length !== IMAGES_PER_DECK) {
            console.error("Deck " + d + " does not have " + IMAGES_PER_DECK + " pictures.");
        }
        deckImages[d].forEach(function (file) { all.push(file); });
    }
    if (new Set(all).size !== 4 * IMAGES_PER_DECK) {
        console.error("The four decks must use 120 different pictures in total.");
    }
    if (!FORCE_PLACEHOLDERS) {
        all.forEach(function (file) {
            const preload = new Image();
            preload.src = file;     // missing files just show a placeholder later
        });
    }
    // Preload the card back so it does not flicker in
    const backPreload = new Image();
    backPreload.src = CARD_BACK;

    console.log("Version:", conditionName, "| shopping cues:", condition.cue,
                "| on decks:", condition.shoppingDecks.join(" and "),
                "| participant:", participantId);
}

// Sets the version for this participant and prepares the decks and pictures for it
function applyCondition(name) {
    conditionName = name;
    condition = CONDITIONS[name];
    groupName = name.substring(0, 2);
    variationName = name.substring(2);
    assignImages();
    checkAndPreloadImages();
}

// ---------- Deck picture boxes ----------
function deckImageBox(deck) {
    return document.querySelector('.deck[data-deck="' + deck + '"] .deck-image');
}

// Shows the card back (same on all four decks, in every group and variation)
function showCardBack(box) {
    box.innerHTML = "";
    const img = document.createElement("img");
    img.alt = "Card back";
    img.onerror = function () { box.innerHTML = "<span>?</span>"; };   // falls back to ? if the file is missing
    img.src = CARD_BACK;
    box.appendChild(img);
}

function hideAllImages() {
    for (let d = 1; d <= 4; d++) {
        showCardBack(deckImageBox(d));
    }
}

function showPlaceholder(box, deck, number, file) {
    box.innerHTML =
        '<div style="text-align:center;padding:6px;line-height:1.3;overflow-wrap:anywhere;">' +
        '<div style="font-size:20px;font-weight:bold;">' + TYPE_LABELS[deckImageType[deck]] + '</div>' +
        '<div style="font-size:16px;font-weight:bold;">Picture ' + number + ' of ' + IMAGES_PER_DECK + '</div>' +
        '<div style="font-size:12px;">' + (file || "") + '</div>' +
        '</div>';
}

function showImage(deck, number) {
    const box = deckImageBox(deck);
    const file = deckImages[deck][number - 1];
    if (FORCE_PLACEHOLDERS || !file) {
        showPlaceholder(box, deck, number, file);
        return;
    }
    box.innerHTML = "";
    const img = document.createElement("img");
    img.alt = "Deck " + deck + " picture";
    img.onerror = function () { showPlaceholder(box, deck, number, file); };
    img.src = file;
    box.appendChild(img);
}

// ---------- Game flow ----------
function startTask() {
    sequence = buildSequence();
    taskStartTime = Date.now();
    trialIndex = 0;
    balance = START_AMOUNT;
    balanceDisplay.textContent = formatMoney(balance);
    startButton.hidden = true;
    playButton.hidden = false;
    passButton.hidden = false;
    instructionsText.textContent = isTouchDevice ? "Tap PLAY or PASS." : "Press A to PLAY or L to PASS.";
    startTrial();
}

function startTrial() {
    if (trialIndex >= sequence.length) {
        finishTask();
        return;
    }
    hideAllImages();
    const target = sequence[trialIndex];
    // Cue picture appears on the targeted deck BEFORE the decision
    showImage(target, imageCount[target] + 1);
    deckBoxes.forEach(function (box) {
        box.classList.toggle("target", Number(box.dataset.deck) === target);
    });
    trialDisplay.textContent = trialIndex + 1;
    messageDisplay.textContent = "Play or Pass?";
    setButtonsEnabled(true);
    acceptingResponse = true;
    trialStartTime = performance.now();
    timer = setTimeout(function () { respond("timeout"); }, DECISION_TIME);
}

function respond(choice) {
    if (!acceptingResponse) return;
    acceptingResponse = false;
    clearTimeout(timer);
    setButtonsEnabled(false);

    const deck = sequence[trialIndex];
    const latency = (choice === "timeout") ? "" : Math.round(performance.now() - trialStartTime);
    // Decision time: reaction time, or the full 4 s if the participant timed out
    const decisionMs = (choice === "timeout") ? DECISION_TIME : latency;
    cumulativeDecisionMs += decisionMs;
    const imageIndex = imageCount[deck];                       // picture due on this trial
    const assignedFile = deckImages[deck][imageIndex] || "";
    let gain = 0, loss = 0, net = 0;
    const pictureShown = "yes";                             // shown before every decision
    let feedback;

    if (choice === "play") {
        gain = GAINS[deck];
        loss = forcedLeft[deck] > 0 ? 0 : nextLoss(deck);
        forcedLeft[deck]--;
        net = gain - loss;
        balance += net;
        balanceDisplay.textContent = formatMoney(balance);
        if (net > 0) feedback = "You win " + formatMoney(net);
        else if (net < 0) feedback = "You lose " + formatMoney(Math.abs(net));
        else feedback = "You neither win nor lose money";
    } else {
        feedback = (choice === "timeout") ? "Too slow: PASS" : "PASS";
    }

    // Picture was already on screen, so move this deck on to its next one
    imageCount[deck]++;

    dataRows.push({
        participant: participantId,
        condition: conditionName,
        group: groupName,
        variation: variationName,
        trial: trialIndex + 1,
        block: Math.floor(trialIndex / TRIALS_PER_BLOCK) + 1,
        targetDeck: deck,
        deckCategory: DECK_TYPE[deck],
        imageCategory: deckImageType[deck],
        imageAssigned: assignedFile,
        pictureShown: pictureShown,
        response: choice,
        latencyMs: latency,
        decisionTimeMs: decisionMs,
        cumulativeDecisionMs: cumulativeDecisionMs,
        gain: gain,
        loss: loss,
        netChange: net,
        feedback: feedback,
        balanceAfter: balance,
        timestamp: new Date().toISOString()
    });

    // Local backup after every trial, in case the page is closed or crashes
    try { localStorage.setItem("igt_backup_" + participantId, JSON.stringify(dataRows)); } catch (e) {}

    messageDisplay.textContent = feedback;
    trialIndex++;
    setTimeout(startTrial, FEEDBACK_TIME);
}

function finishTask() {
    hideAllImages();
    deckBoxes.forEach(function (box) { box.classList.remove("target"); });
    playButton.hidden = true;
    passButton.hidden = true;
    instructionsText.textContent = "The task is complete. Thank you!";
    messageDisplay.textContent = "Final balance: " + formatMoney(balance);
    if (typeof onTaskFinished === "function") onTaskFinished();   // defined in flow.js
}

// ---------- Starting screen ----------
balanceDisplay.textContent = formatMoney(START_AMOUNT);
instructionsText.textContent =
    "You start with " + formatMoney(START_AMOUNT) + ". On each turn an arrow will point to one deck. " +
    "A picture will appear on that deck. " +
    (isTouchDevice
        ? "Tap PLAY to take a card from that deck, which may win or lose money, or tap PASS to skip it. "
        : "Press PLAY (A key) to take a card from that deck, which may win or lose money, or PASS (L key) to skip it. ") +
    "You have 4 seconds to decide. " +
    "Try to finish with as much money as possible. Click Start when you are ready.";
document.querySelector("footer").textContent =
    "Your responses are anonymous and used only for academic purposes.";
hideAllImages();
if (CONDITIONS[forcedCondition]) applyCondition(forcedCondition);   // test links only; otherwise flow.js chooses

// ---------- Buttons and keys ----------
startButton.addEventListener("click", startTask);
playButton.addEventListener("click", function () { respond("play"); });
passButton.addEventListener("click", function () { respond("pass"); });

document.addEventListener("keydown", function (event) {
    const key = event.key.toLowerCase();
    if (key === "a") respond("play");
    if (key === "l") respond("pass");
});