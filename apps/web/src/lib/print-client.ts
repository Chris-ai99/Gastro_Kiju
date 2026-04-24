"use client";

import type { NetworkPrinterConfig, PersistedPrintJob } from "@kiju/domain";

import type {
  CreatePrintJobRequest,
  PrintJobResponse,
  PrintOverviewResponse,
  UpdatePrinterConfigRequest
} from "./print-contract";
import { resolvePrintApiPath } from "./print-contract";

const parseJson = async <T>(response: Response) => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export const fetchPrintOverview = async (): Promise<PrintOverviewResponse | null> => {
  try {
    const response = await fetch(resolvePrintApiPath("/jobs"), {
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }

    return parseJson<PrintOverviewResponse>(response);
  } catch {
    return null;
  }
};

export const savePrinterConfig = async (
  printer: UpdatePrinterConfigRequest
): Promise<{ ok: boolean; printer?: NetworkPrinterConfig; message?: string }> => {
  try {
    const response = await fetch(resolvePrintApiPath("/config"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(printer)
    });
    const payload = await parseJson<{
      ok: boolean;
      printer: NetworkPrinterConfig;
      message?: string;
    }>(response);

    if (!response.ok || !payload) {
      return {
        ok: false,
        message: payload?.message ?? "Druckerkonfiguration konnte nicht gespeichert werden."
      };
    }

    return payload;
  } catch {
    return {
      ok: false,
      message: "Druckerkonfiguration konnte nicht gespeichert werden."
    };
  }
};

export const createPrintJob = async (
  request: CreatePrintJobRequest
): Promise<PrintJobResponse> => {
  try {
    const response = await fetch(resolvePrintApiPath("/jobs"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });
    const payload = await parseJson<PrintJobResponse>(response);

    if (!response.ok || !payload) {
      return {
        ok: false,
        printer: {
          enabled: false,
          host: "",
          port: 9100,
          model: "Epson TM-T70II"
        },
        message: payload?.message ?? "Druckjob konnte nicht erstellt werden."
      };
    }

    return payload;
  } catch {
    return {
      ok: false,
      printer: {
        enabled: false,
        host: "",
        port: 9100,
        model: "Epson TM-T70II"
      },
      message: "Druckjob konnte nicht erstellt werden."
    };
  }
};

export const requestPrinterTestPrint = async (): Promise<PrintJobResponse> =>
  (async () => {
    try {
      const response = await fetch(resolvePrintApiPath("/test"), {
        method: "POST"
      });
      const payload = await parseJson<PrintJobResponse>(response);

      if (!response.ok || !payload) {
        return {
          ok: false,
          printer: {
            enabled: false,
            host: "",
            port: 9100,
            model: "Epson TM-T70II"
          },
          message: payload?.message ?? "Testdruck konnte nicht gestartet werden."
        };
      }

      return payload;
    } catch {
      return {
        ok: false,
        printer: {
          enabled: false,
          host: "",
          port: 9100,
          model: "Epson TM-T70II"
        },
        message: "Testdruck konnte nicht gestartet werden."
      };
    }
  })();

export const retryPrintJob = async (
  jobId: string
): Promise<{ ok: boolean; job?: PersistedPrintJob; message?: string }> => {
  try {
    const response = await fetch(resolvePrintApiPath(`/jobs/${jobId}/retry`), {
      method: "POST"
    });
    const payload = await parseJson<{
      ok: boolean;
      job?: PersistedPrintJob;
      message?: string;
    }>(response);

    if (!response.ok || !payload) {
      return {
        ok: false,
        message: payload?.message ?? "Druckjob konnte nicht erneut gesendet werden."
      };
    }

    return payload;
  } catch {
    return {
      ok: false,
      message: "Druckjob konnte nicht erneut gesendet werden."
    };
  }
};
