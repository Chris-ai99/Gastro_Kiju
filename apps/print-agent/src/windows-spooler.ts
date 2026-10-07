import { spawn } from "node:child_process";

type PowerShellRunner = (
  script: string,
  printerName: string,
  stdinText?: string
) => Promise<void>;

const RAW_PRINT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class KiJuRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOC_INFO_1 {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string name, out IntPtr printer, IntPtr defaults);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr printer, int level, ref DOC_INFO_1 info);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr printer, byte[] bytes, int count, out int written);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr printer);
  public static Exception LastError() { return new Win32Exception(Marshal.GetLastWin32Error()); }
}
'@
$printerName = $env:KIJU_WINDOWS_PRINTER_NAME
$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())
$printer = [IntPtr]::Zero
$documentStarted = $false
$pageStarted = $false
if (-not [KiJuRawPrinter]::OpenPrinter($printerName, [ref]$printer, [IntPtr]::Zero)) { throw [KiJuRawPrinter]::LastError() }
try {
  $info = New-Object KiJuRawPrinter+DOC_INFO_1
  $info.pDocName = 'KiJu Bondruck'
  $info.pOutputFile = $null
  $info.pDataType = 'RAW'
  if ([KiJuRawPrinter]::StartDocPrinter($printer, 1, [ref]$info) -eq 0) { throw [KiJuRawPrinter]::LastError() }
  $documentStarted = $true
  if (-not [KiJuRawPrinter]::StartPagePrinter($printer)) { throw [KiJuRawPrinter]::LastError() }
  $pageStarted = $true
  $written = 0
  if (-not [KiJuRawPrinter]::WritePrinter($printer, $bytes, $bytes.Length, [ref]$written)) { throw [KiJuRawPrinter]::LastError() }
  if ($written -ne $bytes.Length) { throw "Der Windows-Druckerspooler hat nur $written von $($bytes.Length) Byte übernommen." }
}
finally {
  if ($pageStarted) { [void][KiJuRawPrinter]::EndPagePrinter($printer) }
  if ($documentStarted) { [void][KiJuRawPrinter]::EndDocPrinter($printer) }
  if ($printer -ne [IntPtr]::Zero) { [void][KiJuRawPrinter]::ClosePrinter($printer) }
}
`;

const PROBE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$printer = Get-Printer -Name $env:KIJU_WINDOWS_PRINTER_NAME -ErrorAction Stop
if (-not $printer) { throw 'Der Windows-Drucker wurde nicht gefunden.' }
`;

const runPowerShell: PowerShellRunner = (script, printerName, stdinText) =>
  new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("Der Windows-Druckerspooler ist nur unter Windows verfügbar."));
      return;
    }

    const encodedScript = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodedScript],
      {
        windowsHide: true,
        env: { ...process.env, KIJU_WINDOWS_PRINTER_NAME: printerName },
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error((stderr || stdout).trim() || `PowerShell wurde mit Status ${code} beendet.`));
      }
    });
    child.stdin.end(stdinText ?? "", "utf8");
  });

const validatePrinterName = (printerName: string) => {
  const normalized = printerName.trim();
  if (!normalized) {
    throw new Error("Es ist kein Windows-Druckername oder Freigabepfad eingetragen.");
  }
  return normalized;
};

export const probeWindowsPrinter = async (
  printerName: string,
  run: PowerShellRunner = runPowerShell
) => run(PROBE_SCRIPT, validatePrinterName(printerName));

export const sendRawEscPosToWindowsPrinter = async (
  printerName: string,
  payload: Uint8Array,
  run: PowerShellRunner = runPowerShell
) => {
  const normalizedName = validatePrinterName(printerName);
  if (payload.byteLength === 0) throw new Error("Die ESC/POS-Druckdaten sind leer.");
  await run(
    RAW_PRINT_SCRIPT,
    normalizedName,
    Buffer.from(payload).toString("base64")
  );
};
