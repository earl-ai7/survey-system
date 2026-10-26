# PST Pastil Survey Recorder

Stack: HTML + CSS + JavaScript only. No server, no PHP, no database.

## Run
Double-click `index.html` (opens in your browser). That's it.

## Folder
- index.html     page
- css/style.css  styling (centered layout)
- js/app.js      form, photo scanner, records, CSV download
- js/grid.js     automatic checkbox grid finder

## Where is the data?
Responses are saved in the browser's localStorage on that computer and browser.
Clearing browsing data deletes them, so press "Download CSV" regularly as a backup.

## Cameras
- The camera opens automatically when the page loads (allow camera access when asked; needs localhost or https).
- The live view outlines the answer boxes it finds (blue) and the answers it reads (green). The dashed frame shows where to place the sheet.
- The sheet does not need to be flat: curled, bent or tilted sheets (and any rotation) are found too.
- When the round button turns green, the sheet is found: press it to record.

## Automatic recording
Every sheet that is read completely (all 10 rows) is saved straight into the Live results table on the main page.
No Save button, no Answers form. The Answers box only appears when a row is unclear (or press "Enter answers manually").

## All 10 questions are required
If any question has no clear answer (nothing ticked, two ticks, or unreadable), a window lists the missing
questions (e.g. "Q3, Q7") and the survey is NOT recorded. Press "Fix answers" to complete it by hand, or Close to skip the sheet.
The same window appears when saving the Answers form with a question left blank.

## How scanning works
Open index.html: the camera starts by itself (allow camera access once).
Put a sheet in view and press the round button. The page finds the 10 x 5 boxes on its own, at any tilt or rotation,
reads the answers and records them, with a beep and "Saved #n". Missing/unclear question = window listing them,
nothing recorded. js/grid.js is the box finder. No clicking on boxes is needed. If no boxes are found, the page asks you to press the button again.
If the camera is blocked, allow camera access in the browser and reload the page.

## Offline / install as an app (PWA)
- Host the folder on any https site (e.g. GitHub Pages, Netlify) or run it on localhost. Offline mode does NOT work when
  index.html is opened by double-click (file://), because browsers only allow it on https/localhost.
- Open the link once while online. After that it works with no internet.
- Android/Chrome: tap "Install app" (top of page) or menu > Install app. iPhone/Safari: Share > Add to Home Screen.
- Your data stays in the phone's localStorage either way. Download CSV regularly.
- After changing any file, edit VERSION in sw.js (e.g. survey-v2) so phones pick up the update.
