# Google Apps Script Backend Setup for SUPERNOVA 3.0

This guide provides a ready-to-paste Google Apps Script to handle form submissions from the SUPERNOVA 3.0 website. It appends submissions to separate tabs (`Participation`, `Visitor`, `Esports`) in a Google Spreadsheet and emails the helpdesk on each submission.

---

## 1. Create the Google Spreadsheet

1. Go to [Google Sheets](https://sheets.new) and create a new spreadsheet named **"SUPERNOVA 3.0 Registrations"**.
2. Create three tabs with the exact names:
   - `Participation`
   - `Visitor`
   - `Esports`
3. Add the header row in row 1 of each tab:
   - **Participation**: `Timestamp | Institution | Contact Person | Email | Phone | Experience Area | Project Title | Description | Participants Count`
   - **Visitor**: `Timestamp | Full Name | Email | Phone | Organisation | Visitor Type | Days Attending`
   - **Esports**: `Timestamp | Team Name | Game | Representative | Email | Phone | Institution | Players Roster`

---

## 2. Paste the Google Apps Script

1. In your Google Sheet, click **Extensions > Apps Script**.
2. Replace all code in `Code.gs` with the snippet below:

```javascript
/**
 * SUPERNOVA 3.0 — Form Submission Webhook
 * Receives POST requests and appends to Google Sheet tabs + emails helpdesk.
 */

const HELPDESK_EMAIL = "animationthenationalcollege@gmail.com";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const type = (data.type || "").toLowerCase();
    const timestamp = new Date().toISOString();

    if (type === "participation") {
      const sheet = ss.getSheetByName("Participation") || ss.insertSheet("Participation");
      sheet.appendRow([
        timestamp,
        data.institution || "",
        data.contact_person || "",
        data.email || "",
        data.phone || "",
        data.experience_area || "",
        data.project_title || "",
        data.description || "",
        data.participants_count || ""
      ]);

      sendNotificationEmail(
        "New Participation Registration: " + (data.project_title || data.institution),
        JSON.stringify(data, null, 2)
      );
    } else if (type === "visitor") {
      const sheet = ss.getSheetByName("Visitor") || ss.insertSheet("Visitor");
      sheet.appendRow([
        timestamp,
        data.full_name || "",
        data.email || "",
        data.phone || "",
        data.organisation || "",
        data.visitor_type || "",
        data.days_attending || ""
      ]);

      sendNotificationEmail(
        "New Visitor Registration: " + data.full_name,
        JSON.stringify(data, null, 2)
      );
    } else if (type === "esports") {
      const sheet = ss.getSheetByName("Esports") || ss.insertSheet("Esports");
      const playersFormatted = (data.players || [])
        .map((p, i) => `${i + 1}. ${p.name || "N/A"} (${p.gamerId || "N/A"})`)
        .join("; ");

      sheet.appendRow([
        timestamp,
        data.team_name || "",
        data.game || "",
        data.team_representative || "",
        data.email || "",
        data.phone || "",
        data.institution || "",
        playersFormatted
      ]);

      sendNotificationEmail(
        "New Esports Squad Registration: " + data.team_name,
        JSON.stringify(data, null, 2)
      );
    } else {
      return ContentService.createTextOutput(
        JSON.stringify({ status: "error", message: "Unknown registration type" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", message: "Registration recorded successfully" })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function sendNotificationEmail(subject, bodyText) {
  try {
    MailApp.sendEmail({
      to: HELPDESK_EMAIL,
      subject: "[SUPERNOVA 3.0] " + subject,
      body: bodyText
    });
  } catch (e) {
    Logger.log("Email dispatch failed: " + e.toString());
  }
}
```

---

## 3. Deploy as a Web App

1. Click **Deploy > New deployment**.
2. Select type: **Web app**.
3. Configuration:
   - **Execute as**: *Me*
   - **Who has access**: *Anyone* (crucial for client-side form submissions).
4. Click **Deploy**, authorize permissions when prompted.
5. Copy the generated **Web App URL** (e.g., `https://script.google.com/macros/s/.../exec`).

---

## 4. Connect to SUPERNOVA 3.0 Frontend

Paste the generated Web App URL into `src/content/site.ts`:

```typescript
formEndpoints: {
  participation: "YOUR_WEB_APP_URL_HERE",
  visitor: "YOUR_WEB_APP_URL_HERE",
  esports: "YOUR_WEB_APP_URL_HERE",
}
```

Once pasted, the "Form not connected yet" banner will automatically disappear and submissions will POST directly to your Google Sheet!
