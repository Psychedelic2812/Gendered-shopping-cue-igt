GENDERED SHOPPING IGT: SETUP AND USE
=====================================

WHAT THIS IS
A browser version of the Iowa Gambling Task (IGT) with shopping pictures on the decks.
Design: 2 x 2 between subjects.
  Group 1 (G1): shopping pictures on the two GOOD decks (3, 4); neutral pictures on decks 1, 2.
  Group 2 (G2): shopping pictures on the two BAD decks (1, 2); neutral pictures on decks 3, 4.
  Variation 1 (V1): male shopping cues.
  Variation 2 (V2): female shopping cues.
Conditions: G1V1, G1V2, G2V1, G2V2.

AUTOMATIC ALLOCATION (no personal links any more)
Participants all open the same address (index.html). After they answer the gender question:
  - Woman -> V2 (female cues). Man -> V1 (male cues).
  - Non-binary, self-describe, prefer not to say -> whichever variation has fewer participants.
    Remove these participants during data cleaning.
  - Inside each variation the group alternates G1, G2, G1, G2... so each variation stays 50-50.
The counter is kept by the Google Sheet script, so it stays balanced on any device and any browser.

FILES
  index.html, experiment.js, flow.js, styles.css, assets/   -> go on GitHub (participant site)
  researcher.html                                            -> KEEP ON YOUR COMPUTER ONLY
  Code.gs                                                    -> pasted into Google Apps Script only
Do not upload researcher.html or Code.gs to GitHub. The researcher key lives only inside Code.gs.

The assets folder must contain: card_back.png, shopping_male/m01.png ... m60.png,
shopping_female/f01.png ... f60.png, neutral/n01.png ... n60.png.

---------------------------------------------------------------------
STEP 1: SET UP THE GOOGLE SHEET SCRIPT (once)
---------------------------------------------------------------------
1. Open the Google Sheet that should hold the data.
2. Extensions > Apps Script. Delete the old code and paste in all of Code.gs.
3. Near the top, change RESEARCHER_KEY to a private password. Only you should know it.
4. Click Save, then Deploy > Manage deployments.
   - If you already have a deployment, click the pencil (Edit), set Version to "New version", Deploy.
     The web address stays the same, so SHEET_URL in experiment.js does not need to change.
   - Otherwise choose Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
     Copy the Web app URL and paste it as SHEET_URL at the top of experiment.js (and into
     researcher.html if it differs).
5. The first time, Google asks you to authorise the script. Allow it.
6. Three sheets appear automatically when the first participant arrives:
     Allocations   who was assigned which condition (this is the counter)
     Trials        one row per trial, with questionnaire answers repeated on every row
     Participants  one summary row per participant (final balance, demographics, IGI items and total,
                  Short UPPS-P raw items, five subscale scores and total)

Whenever you edit Code.gs you must redeploy a New version for the change to take effect.

---------------------------------------------------------------------
STEP 2: PUT THE PARTICIPANT SITE ON GITHUB
---------------------------------------------------------------------
Upload index.html, experiment.js, flow.js, styles.css and the assets folder, turn on GitHub Pages,
and give participants the plain address, for example https://yourname.github.io/your-repo/
No ?condition= or ?pid= is needed. Everyone gets the same link.

---------------------------------------------------------------------
STEP 3: RESEARCHER DASHBOARD
---------------------------------------------------------------------
Open researcher.html from your own computer (double-click it). Enter the script address and your
researcher key, then press Connect / Refresh. It shows:
  - how many participants are in each variation and group, and which group is next
  - a log of every allocation, with a Remove button to free a slot (for example, a dropout)
  - a CSV download of the allocation log
It refreshes by itself every 30 seconds.

---------------------------------------------------------------------
TESTING
---------------------------------------------------------------------
Add ?condition=G1V1&pid=TEST01 to the site address (use any of G1V1, G1V2, G2V1, G2V2).
This forces that version and does NOT use up an allocation slot. The test data is still saved to the
Trials and Participants sheets, so delete the TEST rows before analysis.

---------------------------------------------------------------------
NOTES AND KNOWN LIMITS
---------------------------------------------------------------------
- Participant IDs must be unique. If two people type the same ID they are treated as one person
  (same condition, and the second upload replaces the first). Blank IDs are generated automatically.
- A participant who quits midway still holds their slot until you press Remove on the dashboard.
- If the internet drops while a participant presses Continue after the demographics page, they see a
  message and can press Continue again. Nothing is assigned until the server replies.
- The site address and script address are public (visible in the code). Anyone who finds the script
  address could submit fake data, but cannot read the allocation log without the researcher key.
- Data is saved to the sheet after the card task and again after the final questions; the second
  upload replaces the first, so there are no duplicates. A backup copy is also kept in the
  participant's browser, and the end screen offers a CSV download if saving fails.
- To use the data in Excel: in Google Sheets choose File > Download > Microsoft Excel (.xlsx).
- To clear all counters for a fresh run, delete the rows (not the header) of the Allocations sheet,
  and clear the Trials and Participants sheets the same way.
- Non-binary / self-describe / prefer-not-to-say participants still take a slot in the alternation,
  so after removing them the final groups may differ by one or two. Recruiting a few extra people covers this.