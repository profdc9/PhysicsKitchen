# How to Start the Dev Server

## First-time setup (one time only)

If you get a "running scripts is disabled" error in PowerShell, run this once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Press `Y` to confirm.

## Starting the server

Open PowerShell, navigate to this directory, and run:

```powershell
cd C:\Users\dmarks\Documents\claude\PhysicsKitchen
npm run dev
```

Then open the URL shown in the terminal (usually http://localhost:5173) in your browser.

## Stopping the server

Press `Ctrl+C` in the PowerShell window.
