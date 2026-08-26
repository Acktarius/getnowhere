import {
  AlertCircle,
  FileUp,
  ImagePlus,
  KeyRound,
  Loader2,
  QrCode,
  ScanLine,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AddressQrScanButton } from "@/components/qr/AddressQrScanButton";
import { decodeQrFromImageData } from "@/lib/qr-decode";
import { SecureInput } from "@/components/SecureInput";
import { BackLink, TopBar } from "@/components/TopBar";
import { walletService } from "@/services";
import { validateConcealMnemonic } from "@/services/conceal/ConcealWalletAdapter";
import { markOnboarded } from "@/state/authStore";
import { useWalletStore } from "@/state/walletStore";
import type { ImportWalletInput } from "@/types/services";
import { shortAddress } from "@/utils/format";
import {
  describePasswordFailure,
  WALLET_PASSWORD_HINTS,
  walletPasswordStrength,
} from "@/utils/walletPassword";

type Method = "qr" | "mnemonic" | "keys" | "file";

export function ImportWalletScreen() {
  const navigate = useNavigate();
  const importWallet = useWalletStore((s) => s.importWallet);
  const initializing = useWalletStore((s) => s.initializing);

  const [method, setMethod] = useState<Method>("qr");
  const [error, setError] = useState<string | null>(null);

  // shared
  const [walletPassword, setWalletPassword] = useState("");
  const [walletPasswordConfirm, setWalletPasswordConfirm] = useState("");

  const passwordStrength = walletPasswordStrength(walletPassword);
  const needsBackupPassword = method === "file";
  const needsNewWalletPassword =
    method === "qr" || method === "mnemonic" || method === "keys";

  // qr
  const [qrText, setQrText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number>(0);

  // mnemonic
  const [seed, setSeed] = useState("");
  const [seedScanHeight, setSeedScanHeight] = useState("");

  // keys
  const [viewOnly, setViewOnly] = useState(false);
  const [spendKey, setSpendKey] = useState("");
  const [viewKey, setViewKey] = useState("");
  const [address, setAddress] = useState("");
  const [keysScanHeight, setKeysScanHeight] = useState("");
  const [previewedAddress, setPreviewedAddress] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // file
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = seed.trim().split(/\s+/).filter(Boolean).length;

  // ===== QR scanning =====

  useEffect(() => {
    if (method !== "qr") {
      stopCamera();
      return;
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  async function startCamera() {
    setScanError(null);
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
        // iOS WKWebView resolves play() before the decoder reports frame dimensions.
        // Wait for the first event that signals a valid size before scanning.
        // @see docs/builds/expo-eas-ios-build.md
        if (!video.videoWidth) {
          await new Promise<void>((resolve) => {
            const done = () => resolve();
            video.addEventListener("loadedmetadata", done, { once: true });
            video.addEventListener("resize", done, { once: true });
          });
        }
      }
      scanLoop();
    } catch {
      setScanError("Camera unavailable. Upload a QR screenshot instead.");
      setScanning(false);
    }
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }

  async function scanLoop() {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    const detected = await detectQrFromVideo(videoRef.current);
    if (detected) {
      setQrText(detected);
      stopCamera();
      return;
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  }

  async function detectQrFromVideo(
    video: HTMLVideoElement,
  ): Promise<string | null> {
    // Try hardware BarcodeDetector first (iOS 17+ / Chrome).
    const detector = getBarcodeDetector();
    if (detector) {
      try {
        const codes = await detector.detect(video);
        if (codes.length > 0) return codes[0].rawValue ?? null;
      } catch {
        // transient frame errors — fall through to jsQR
      }
    }
    // jsQR fallback — required on iOS < 17 where BarcodeDetector is unavailable.
    if (!video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return decodeQrFromImageData(frame.data, frame.width, frame.height) ?? null;
  }

  async function handleImagePicked(file: File) {
    setScanError(null);
    try {
      // Use data: URL instead of blob: URL — WKWebView (file:// origin) treats
      // blob: URLs as cross-origin, tainting the canvas so getImageData returns
      // zeros. A data: URL is always same-origin. @see docs/builds/expo-eas-ios-build.md
      const url = await fileToDataUrl(file);
      const img = new Image();
      img.src = url;
      await new Promise((res) => {
        img.onload = res;
        img.onerror = res;
      });
      const detector = getBarcodeDetector();
      if (detector) {
        try {
          const codes = await detector.detect(img);
          if (codes.length > 0 && codes[0].rawValue) {
            setQrText(codes[0].rawValue);
            return;
          }
        } catch {
          /* fall through to jsqr */
        }
      }
      // jsqr fallback when BarcodeDetector is missing or returns empty
      const decoded = await decodeQrWithJsQr(img);
      if (decoded) {
        setQrText(decoded);
      } else {
        setScanError("No QR code found in that image. Try another screenshot.");
      }
    } catch {
      setScanError("Couldn't read that image.");
    }
  }

  function resetCrossFields(next: Method) {
    setMethod(next);
    setError(null);
    setPreviewedAddress(null);
    if (next !== "mnemonic") setSeed("");
    if (next !== "keys") {
      setSpendKey("");
      setViewKey("");
      setAddress("");
      setViewOnly(false);
    }
    if (next !== "file") {
      setFileName(null);
      setFileText("");
    }
    if (next !== "qr") {
      setQrText("");
      setScanError(null);
    }
    setWalletPassword("");
    setWalletPasswordConfirm("");
  }

  async function handlePreviewKeys() {
    setError(null);
    if (spendKey.trim().length < 64) {
      return setError("Enter a valid 64-char hex spend key.");
    }
    setPreviewing(true);
    try {
      const res = await walletService.previewKeys({
        spendKey: spendKey.trim(),
        viewKey: viewKey.trim() || undefined,
      });
      setPreviewedAddress(res.address);
      if (!viewKey.trim()) setViewKey(res.viewKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  function handleFilePicked(file: File) {
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileText(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
  }

  function buildInput(): ImportWalletInput | null {
    if (method === "qr") {
      if (!qrText.trim()) {
        setError("Scan a QR code or upload a QR screenshot.");
        return null;
      }
      return {
        method: "qr",
        qr: qrText.trim(),
        password: walletPassword,
      };
    }
    if (method === "mnemonic") {
      if (wordCount < 12) {
        setError("Enter your full seed phrase (25 words).");
        return null;
      }
      if (!validateConcealMnemonic(seed.trim())) {
        setError("This seed phrase is not valid. Check the words and order.");
        return null;
      }
      return {
        method: "mnemonic",
        mnemonic: seed.trim(),
        password: walletPassword,
        scanHeight: seedScanHeight ? Number(seedScanHeight) : undefined,
      };
    }
    if (method === "keys") {
      if (viewOnly) {
        if (!address.trim()) {
          setError("Enter your CCX address.");
          return null;
        }
        if (!viewKey.trim()) {
          setError("Enter your private view key.");
          return null;
        }
        return {
          method: "keys",
          viewOnly: true,
          address: address.trim(),
          privateViewKey: viewKey.trim(),
          privateSpendKey: "",
          password: walletPassword,
          scanHeight: keysScanHeight ? Number(keysScanHeight) : undefined,
        };
      }
      if (spendKey.trim().length < 64) {
        setError("Enter a valid 64-char hex spend key.");
        return null;
      }
      return {
        method: "keys",
        viewOnly: false,
        address: previewedAddress ?? "",
        privateSpendKey: spendKey.trim(),
        privateViewKey: viewKey.trim(),
        password: walletPassword,
        scanHeight: keysScanHeight ? Number(keysScanHeight) : undefined,
      };
    }
    // file
    if (!fileText) {
      setError("Choose a wallet backup file.");
      return null;
    }
    return {
      method: "file",
      file: fileText,
      password: walletPassword,
    };
  }

  async function handleImport() {
    setError(null);
    if (needsBackupPassword) {
      if (!walletPassword) {
        return setError("Enter the password used to encrypt this backup.");
      }
    } else if (needsNewWalletPassword) {
      const pwError = describePasswordFailure(walletPassword);
      if (pwError) return setError(pwError);
      if (walletPassword !== walletPasswordConfirm) {
        return setError("Passwords do not match.");
      }
    }
    const input = buildInput();
    if (!input) return;
    try {
      await importWallet(input);
      // Match next-wallet: land on the wallet page after import — never block on
      // an app-passcode / password-change step (passcode can be set later in Settings).
      markOnboarded();
      navigate("/wallet");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const subtitle =
    method === "qr"
      ? "Scan wallet backup QR code"
      : "Seed, keys, or backup file";

  return (
    <div className="screen">
      <TopBar
        title="Import wallet"
        leading={<BackLink to="/welcome" />}
        subtitle={subtitle}
      />
      <div
        className="screen-scroll stack stack--gap-5"
        style={{ padding: "20px 16px 40px" }}
      >
        <div className="stack stack--gap-4 fade-in-up">
          <div
            className="card card--pad-md"
            style={{
              borderColor: "var(--danger)",
              background: "var(--danger-soft)",
            }}
          >
            <div className="row-flex" style={{ gap: 8 }}>
              <AlertCircle size={16} style={{ color: "var(--danger)" }} />
              <span style={{ fontSize: 13, color: "var(--danger)" }}>
                Only enter wallet secrets on a device you control. Get NowHere
                never sends them anywhere.
              </span>
            </div>
          </div>

          {method === "qr" ? (
            <QrPrimaryView
              qrText={qrText}
              setQrText={setQrText}
              scanning={scanning}
              scanError={scanError}
              videoRef={videoRef}
              onStartCamera={startCamera}
              onStopCamera={stopCamera}
              imageInputRef={imageInputRef}
              onImagePicked={handleImagePicked}
              onSwitchMethod={resetCrossFields}
            />
          ) : (
            <>
              <MethodTabs method={method} onChange={resetCrossFields} />

              {method === "mnemonic" && (
                <div className="stack stack--gap-4">
                  <div className="field">
                    <span className="field__label">
                      Seed phrase{" "}
                      <span className="faint">{wordCount} words</span>
                    </span>
                    <textarea
                      className="textarea input--mono"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      placeholder="orbit lantern cipher violet harbor…"
                      style={{ minHeight: 120 }}
                      autoFocus
                    />
                  </div>
                  <ScanHeightField
                    value={seedScanHeight}
                    onChange={setSeedScanHeight}
                    hint="Start syncing from this block instead of scanning from genesis. Use the block height where this wallet was created."
                  />
                </div>
              )}

              {method === "keys" && (
                <div className="stack stack--gap-4">
                  <div
                    className="row-flex"
                    style={{
                      gap: 8,
                      padding: "4px",
                      background: "var(--bg-elev)",
                      border: 1,
                      borderStyle: "solid",
                      borderColor: "var(--border)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <KeyModeToggle
                      active={!viewOnly}
                      onClick={() => setViewOnly(false)}
                      label="Full keys"
                    />
                    <KeyModeToggle
                      active={viewOnly}
                      onClick={() => setViewOnly(true)}
                      label="View-only"
                    />
                  </div>

                  {viewOnly ? (
                    <>
                      <SecureInput
                        label="CCX address"
                        value={address}
                        onChange={setAddress}
                        placeholder="ccx7…"
                        mono
                        endAdornment={
                          <AddressQrScanButton
                            style={{ width: 34, height: 34 }}
                            onScan={(draft) => setAddress(draft.address)}
                          />
                        }
                      />
                      <SecureInput
                        label="Private view key"
                        value={viewKey}
                        onChange={setViewKey}
                        placeholder="64-char hex"
                        mono
                        revealable
                      />
                    </>
                  ) : (
                    <>
                      <SecureInput
                        label="Private spend key"
                        value={spendKey}
                        onChange={setSpendKey}
                        placeholder="64-char hex"
                        mono
                        revealable
                      />
                      <SecureInput
                        label="Private view key (optional — derived if blank)"
                        value={viewKey}
                        onChange={setViewKey}
                        placeholder="64-char hex"
                        mono
                        revealable
                      />
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm btn--block"
                        disabled={previewing || spendKey.trim().length < 64}
                        onClick={handlePreviewKeys}
                      >
                        {previewing ? (
                          <>
                            <Loader2 size={14} className="spin" /> Deriving…
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} /> Preview address
                          </>
                        )}
                      </button>
                      {previewedAddress && (
                        <div className="card card--pad-md">
                          <div className="field__label">Derived address</div>
                          <div
                            className="mono"
                            style={{
                              fontSize: 13,
                              wordBreak: "break-all",
                              color: "var(--primary)",
                            }}
                          >
                            {shortAddress(previewedAddress, 5, 5)}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <ScanHeightField
                    value={keysScanHeight}
                    onChange={setKeysScanHeight}
                    hint="Start syncing from this block instead of scanning from genesis."
                  />
                </div>
              )}

              {method === "file" && (
                <div className="stack stack--gap-4">
                  <button
                    type="button"
                    className="btn btn--secondary btn--block"
                    style={{ height: 88, flexDirection: "column", gap: 6 }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileUp size={22} />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {fileName ?? "Choose backup file"}
                    </span>
                    {fileName && (
                      <span className="faint" style={{ fontSize: 12 }}>
                        Tap to choose a different file
                      </span>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFilePicked(f);
                    }}
                  />
                  <p
                    className="muted"
                    style={{ fontSize: 12.5, lineHeight: 1.5 }}
                  >
                    The file's embedded creation height is used as the scan
                    start, so import resumes from where the backup left off.
                  </p>
                </div>
              )}

              {method === "file" && (
                <SecureInput
                  label="Backup password"
                  value={walletPassword}
                  onChange={setWalletPassword}
                  placeholder="Password used to encrypt this file"
                  revealable
                />
              )}

              {(method === "mnemonic" || method === "keys") && (
                <PasswordSection
                  password={walletPassword}
                  setPassword={setWalletPassword}
                  confirmPassword={walletPasswordConfirm}
                  setConfirmPassword={setWalletPasswordConfirm}
                  strength={passwordStrength}
                />
              )}
            </>
          )}

          {method === "qr" && (
            <PasswordSection
              password={walletPassword}
              setPassword={setWalletPassword}
              confirmPassword={walletPasswordConfirm}
              setConfirmPassword={setWalletPasswordConfirm}
              strength={passwordStrength}
            />
          )}

          {error && <div className="field__error">{error}</div>}

          <button
            className="btn btn--block btn--primary"
            disabled={initializing}
            onClick={handleImport}
          >
            {initializing ? (
              <>
                <Loader2 size={16} className="spin" /> Importing…
              </>
            ) : (
              "Import wallet"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== QR primary view =====

function QrPrimaryView({
  qrText,
  setQrText,
  scanning,
  scanError,
  videoRef,
  onStartCamera,
  onStopCamera,
  imageInputRef,
  onImagePicked,
  onSwitchMethod,
}: {
  qrText: string;
  setQrText: (v: string) => void;
  scanning: boolean;
  scanError: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  onStartCamera: () => void;
  onStopCamera: () => void;
  imageInputRef: React.RefObject<HTMLInputElement>;
  onImagePicked: (f: File) => void;
  onSwitchMethod: (m: Method) => void;
}) {
  return (
    <div className="stack stack--gap-4">
      {/* Scanner viewport */}
      <div
        className="card card--pad-md"
        style={{
          padding: 0,
          overflow: "hidden",
          minHeight: 240,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background: "var(--bg-elev)",
        }}
      >
        {scanning ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: "100%",
                maxWidth: 320,
                height: 240,
                objectFit: "cover",
                display: "block",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 200,
                height: 200,
                border: "2px solid var(--primary)",
                borderRadius: "var(--radius-md)",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
              }}
            />
            <ScanLine
              size={20}
              style={{
                position: "absolute",
                top: "calc(50% - 10px)",
                left: "calc(50% - 10px)",
                color: "var(--primary)",
                animation: "scan-line 2s ease-in-out infinite",
              }}
            />
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              style={{ position: "absolute", top: 8, right: 8 }}
              onClick={onStopCamera}
            >
              Stop
            </button>
          </>
        ) : qrText ? (
          <div
            className="stack"
            style={{ alignItems: "center", gap: 12, padding: 24 }}
          >
            <QrCode size={48} style={{ color: "var(--success)" }} />
            <div
              style={{ fontSize: 14, fontWeight: 600, color: "var(--success)" }}
            >
              Scan successful
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setQrText("");
                onStartCamera();
              }}
            >
              Scan again
            </button>
          </div>
        ) : (
          <div
            className="stack"
            style={{ alignItems: "center", gap: 16, padding: 32 }}
          >
            <QrCode size={56} style={{ color: "var(--text-muted)" }} />
            <div style={{ fontSize: 14, fontWeight: 600, textAlign: "center" }}>
              Scan wallet backup QR code
            </div>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={onStartCamera}
            >
              <ScanLine size={15} /> Start camera
            </button>
          </div>
        )}
      </div>

      {scanError && (
        <div className="field__error" style={{ textAlign: "center" }}>
          {scanError}
        </div>
      )}

      {/* Image upload fallback */}
      <button
        type="button"
        className="btn btn--secondary btn--block"
        onClick={() => imageInputRef.current?.click()}
      >
        <ImagePlus size={16} /> Upload QR screenshot
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImagePicked(f);
        }}
      />

      {/* Secondary methods */}
      <div className="card__divider" style={{ margin: "4px 0" }} />
      <div className="faint" style={{ fontSize: 12.5, textAlign: "center" }}>
        No QR code? Import from:
      </div>
      <div className="row-flex" style={{ gap: 8 }}>
        <SecondaryMethodButton
          icon={ScrollText}
          label="Seed"
          onClick={() => onSwitchMethod("mnemonic")}
        />
        <SecondaryMethodButton
          icon={KeyRound}
          label="Keys"
          onClick={() => onSwitchMethod("keys")}
        />
        <SecondaryMethodButton
          icon={FileUp}
          label="File"
          onClick={() => onSwitchMethod("file")}
        />
      </div>
    </div>
  );
}

function SecondaryMethodButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof KeyRound;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn--secondary btn--sm grow"
      onClick={onClick}
      style={{ flexDirection: "column", gap: 4, padding: "10px 4px" }}
    >
      <Icon size={16} />
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

// ===== Method tabs (for non-QR methods) =====

function MethodTabs({
  method,
  onChange,
}: {
  method: Method;
  onChange: (m: Method) => void;
}) {
  const tabs: { id: Method; label: string; icon: typeof KeyRound }[] = [
    { id: "qr", label: "QR", icon: QrCode },
    { id: "mnemonic", label: "Seed", icon: ScrollText },
    { id: "keys", label: "Keys", icon: KeyRound },
    { id: "file", label: "File", icon: FileUp },
  ];
  return (
    <div
      className="row-flex"
      style={{
        gap: 6,
        padding: 4,
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      {tabs.map((t) => {
        const active = method === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className="grow"
            style={{
              height: 40,
              borderRadius: "var(--radius-xs)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: active ? "var(--primary-fg)" : "var(--text-muted)",
              background: active ? "var(--primary)" : "transparent",
              transition:
                "background var(--dur) var(--ease), color var(--dur) var(--ease)",
            }}
          >
            <Icon size={15} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function KeyModeToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grow"
      style={{
        height: 36,
        borderRadius: "var(--radius-xs)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 600,
        color: active ? "var(--primary-fg)" : "var(--text-muted)",
        background: active ? "var(--primary)" : "transparent",
        transition:
          "background var(--dur) var(--ease), color var(--dur) var(--ease)",
      }}
    >
      {label}
    </button>
  );
}

function ScanHeightField({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  return (
    <div className="field">
      <span className="field__label">
        Scan from block <span className="faint">optional</span>
      </span>
      <input
        className="input"
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="0 (scan from genesis)"
        min={0}
      />
      <span className="field__hint">{hint}</span>
    </div>
  );
}

// ===== Password section (seed/keys) =====

function PasswordSection({
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  strength,
}: {
  password: string;
  setPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  strength: number;
}) {
  return (
    <div className="stack stack--gap-3">
      <SecureInput
        label="Wallet password"
        value={password}
        onChange={setPassword}
        placeholder="Encrypts your local wallet file"
        revealable
      />
      {password.length > 0 && (
        <div className="stack stack--gap-2">
          <div className="row-flex" style={{ gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background:
                    n <= strength
                      ? strength >= 4
                        ? "var(--success)"
                        : strength >= 3
                          ? "var(--primary)"
                          : "var(--danger)"
                      : "var(--border)",
                  transition: "background var(--dur) var(--ease)",
                }}
              />
            ))}
          </div>
          <div className="stack" style={{ gap: 3 }}>
            {WALLET_PASSWORD_HINTS.map((hint) => {
              const met = hint.test(password);
              return (
                <div
                  key={hint.id}
                  className="row-flex"
                  style={{ gap: 6, fontSize: 12.5 }}
                >
                  <span
                    style={{
                      color: met ? "var(--success)" : "var(--text-muted)",
                      width: 14,
                    }}
                  >
                    {met ? "✓" : "○"}
                  </span>
                  <span
                    style={{
                      color: met ? "var(--text)" : "var(--text-muted)",
                    }}
                  >
                    {hint.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <SecureInput
        label="Confirm password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Repeat password"
        revealable
      />
      {confirmPassword.length > 0 && password !== confirmPassword && (
        <div className="field__error">Passwords do not match.</div>
      )}
    </div>
  );
}

// ===== BarcodeDetector helper =====

type BarcodeDetectorLike = {
  detect: (
    source: HTMLVideoElement | HTMLImageElement,
  ) => Promise<{ rawValue: string | null }[]>;
};

function getBarcodeDetector(): BarcodeDetectorLike | null {
  const w = window as unknown as {
    BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
  };
  if (typeof w.BarcodeDetector === "function") {
    try {
      return new w.BarcodeDetector({ formats: ["qr_code"] });
    } catch {
      return null;
    }
  }
  return null;
}

/** Read a File as a data: URL (safe for WKWebView canvas — blob: taints the canvas). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Decode a QR from an already-loaded image via jsqr (canvas sample). */
async function decodeQrWithJsQr(img: HTMLImageElement): Promise<string | null> {
  try {
    const { default: jsQR } = await import("jsqr");
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    if (canvas.width < 1 || canvas.height < 1) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    return result?.data ?? null;
  } catch {
    return null;
  }
}
