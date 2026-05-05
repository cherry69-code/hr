# PropHR Windows Sync Agent

This agent runs on the Windows PC that has direct access to the eTimeTrackLite Access database and pushes biometric punches to the live HRMS API.

## What It Does

- Reads new punch rows from the local `.mdb` file
- Supports `DeviceLogs`, `AttendanceLogs`, and `PunchTimeDetails`
- Resolves employee codes using the Access `Employees` table
- Pushes punch batches to `https://api.hrpropninja.com/api/biometric/agent/logs`
- Stores a local checkpoint so the same punches are not resent every run
- Runs on fixed times like `11:00`, `15:00`, `17:00`, and `20:00`

## Folder Setup

1. Copy this `sync-agent` folder to the Windows office PC.
2. Install Node.js LTS.
3. Open a terminal in the `sync-agent` folder.
4. Run:

```bash
npm install
```

5. Copy `config.example.json` to `config.json`.
6. Edit `config.json`:

```json
{
  "apiBaseUrl": "https://api.hrpropninja.com",
  "deviceId": "OFFICE-ESSL-01",
  "deviceToken": "paste-generated-device-token-here",
  "databasePath": "G:\\Essl\\eTimeTrackLite1.mdb",
  "dbUser": "Admin",
  "dbPassword": "",
  "timezone": "Asia/Kolkata",
  "scheduleTimes": ["11:00", "15:00", "17:00", "20:00"]
}
```

## Generate Device Token

Create a biometric device in the HRMS admin panel or database, then generate a token from:

- `POST /api/biometric/devices/:deviceId/token`

Use that token in `config.json` as `deviceToken`.

## Manual Test

Run one sync immediately:

```bash
npm run run-once
```

Normal background mode:

```bash
npm start
```

## Install As Windows Service

1. Download `nssm.exe`
2. Place `nssm.exe` inside this `sync-agent` folder
3. Run PowerShell as Administrator
4. Execute:

```powershell
.\install-service.ps1
```

This creates a Windows service named `PropHRSyncAgent`.

## Files Written By Agent

- Logs: `logs/agent.log`
- Service stdout: `logs/service-out.log`
- Service stderr: `logs/service-err.log`
- Checkpoint state: `data/state.json`

## Important

- The agent must run on the same Windows machine that has the live `.mdb` file.
- The live backend must include the new `/api/biometric/agent/logs` endpoint.
- If the `.mdb` has no punch rows, the agent cannot invent attendance data.
