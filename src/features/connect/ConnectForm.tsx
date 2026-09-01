import { useState, type ReactNode } from "react";

import { Badge, Disclosure, Input, SegmentedControl } from "@/components/ui";
import type {
  CertSource,
  ConnectionOptions,
  ConnectionProfile,
  SessionMode,
  TlsConfig,
  Transport,
} from "@/ipc";
import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";
import { CertField } from "./CertField";
import { DEFAULT_ADDRESS, hostOf } from "./defaults";

const MODES = [
  { value: "client", label: "Client" },
  { value: "peer", label: "Peer" },
] as const satisfies ReadonlyArray<{ value: SessionMode; label: string }>;

/**
 * The transports worth offering in a picker.
 *
 * `udp` is listed because it exists and is genuinely distinct — mistaking it
 * for QUIC is a real and expensive confusion, since they share port 7447 and
 * nothing else.
 */
const TRANSPORTS: ReadonlyArray<{ value: Transport; label: string; hint: string }> = [
  { value: "tcp", label: "TCP", hint: "Zenoh's default listener" },
  { value: "quic", label: "QUIC", hint: "Encrypted. Uses the TLS settings below" },
  { value: "tls", label: "TLS", hint: "TLS over TCP. Uses the TLS settings below" },
  { value: "ws", label: "WebSocket", hint: "For routers behind an HTTP proxy" },
  { value: "unixsock-stream", label: "Unix socket", hint: "A filesystem path, not host:port" },
  { value: "udp", label: "UDP", hint: "Plain datagrams. Not QUIC" },
];

/** Transports whose certificates Zenoh will actually read. */
function usesTls(transport: Transport): boolean {
  return transport === "quic" || transport === "tls";
}

export interface ConnectFormProps {
  /** Values the form starts from. Change the component's `key` to reload it. */
  initial: ConnectionProfile;
  /** Reports the current values on every change, for the footer buttons. */
  onChange: (profile: ConnectionProfile) => void;
  onSubmit: () => void;
}

/**
 * The connection form.
 *
 * Initial values come from a prop and the component is REMOUNTED (by `key`) to
 * load a different profile. That is React's own answer to "reset state when the
 * input changes", and it means the form can never be half-applied.
 */
export function ConnectForm({ initial, onChange, onSubmit }: ConnectFormProps) {
  const [name, setName] = useState(initial.name);
  const [transport, setTransport] = useState<Transport>(initial.transport);
  const [address, setAddress] = useState(initial.address);
  const [mode, setMode] = useState<SessionMode>(initial.mode);
  const [multicast, setMulticast] = useState(initial.multicastScouting);
  const [gossip, setGossip] = useState(initial.gossipScouting);
  const [advanced, setAdvanced] = useState(initial.advancedJson5 ?? "");
  const [options, setOptions] = useState<ConnectionOptions>(initial.options);

  const [rootCa, setRootCa] = useState<CertSource | null>(initial.tls.rootCa);
  const [clientCert, setClientCert] = useState<CertSource | null>(initial.tls.clientCert);
  const [clientKey, setClientKey] = useState<CertSource | null>(initial.tls.clientKey);
  const [enableMtls, setEnableMtls] = useState(initial.tls.enableMtls);
  const [verifyName, setVerifyName] = useState(initial.tls.verifyNameOnConnect);

  const tlsRelevant = usesTls(transport);
  const selected = TRANSPORTS.find((option) => option.value === transport);

  /**
   * Reports the current values upward.
   *
   * Called from every setter rather than an effect, so the parent always has
   * the values the user can see — and so nothing syncs state in an effect.
   */
  const report = (patch: Partial<ConnectionProfile> = {}) => {
    const tls: TlsConfig = {
      rootCa,
      clientCert,
      clientKey,
      enableMtls,
      verifyNameOnConnect: verifyName,
    };
    onChange({
      name: name.trim() || hostOf(address),
      mode,
      transport,
      address: address.trim(),
      // Left empty so the backend builds the endpoint from transport+address.
      // A hand-written endpoint with metadata goes through Advanced instead.
      endpoints: [],
      listen: [],
      // Certificates on a transport that ignores them are rejected by the
      // backend, correctly — so do not send them.
      tls: tlsRelevant
        ? tls
        : { ...tls, rootCa: null, clientCert: null, clientKey: null, enableMtls: false },
      multicastScouting: multicast,
      gossipScouting: gossip,
      options,
      advancedJson5: advanced.trim() || null,
      ...patch,
    });
  };

  return (
    <form
      className="scroll-thin min-w-0 flex-1 space-y-5 overflow-y-auto p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Field label="Transport" hint={selected?.hint ?? ""}>
        <div role="radiogroup" aria-label="Transport" className="flex flex-wrap gap-1.5">
          {TRANSPORTS.map((option) => {
            const active = transport === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setTransport(option.value);
                  report({ transport: option.value });
                }}
                className={cn(
                  "rounded-control text-small tracking-ui h-7 px-2.5 font-medium",
                  transitionFast,
                  focusRing,
                  active
                    ? "bg-accent text-on-accent"
                    : "bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field
        label={transport === "unixsock-stream" ? "Socket path" : "Address"}
        hint={
          transport === "unixsock-stream"
            ? "Absolute path to the socket"
            : "host:port — the port defaults to 7447"
        }
      >
        <Input
          size="lg"
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            report({ address: event.target.value.trim() });
          }}
          placeholder={transport === "unixsock-stream" ? "/run/zenoh/router.sock" : DEFAULT_ADDRESS}
          mono
          spellCheck={false}
          autoComplete="off"
          data-autofocus
        />
      </Field>

      <Field label="Name" hint="Shown on the session tab">
        <Input
          size="lg"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            report({ name: event.target.value.trim() || hostOf(address) });
          }}
          placeholder={hostOf(address)}
          autoComplete="off"
        />
      </Field>

      {tlsRelevant ? (
        <Disclosure
          summary="TLS & certificates"
          meta={enableMtls ? "mutual" : rootCa ? "custom CA" : "system trust"}
          defaultOpen={enableMtls || rootCa !== null}
        >
          <div className="space-y-4 pt-3 pl-5">
            <CertField
              label="CA certificate"
              hint="Verifies the router. Needed unless it is signed by a public CA."
              value={rootCa}
              onChange={(value) => {
                setRootCa(value);
                report({
                  tls: {
                    rootCa: value,
                    clientCert,
                    clientKey,
                    enableMtls,
                    verifyNameOnConnect: verifyName,
                  },
                });
              }}
            />
            <CertField
              label="Client certificate"
              hint="Presented to the router when it asks for one."
              value={clientCert}
              onChange={(value) => {
                setClientCert(value);
                report({
                  tls: {
                    rootCa,
                    clientCert: value,
                    clientKey,
                    enableMtls,
                    verifyNameOnConnect: verifyName,
                  },
                });
              }}
            />
            <CertField
              label="Client private key"
              hint="Never saved into a profile — only its path is."
              value={clientKey}
              onChange={(value) => {
                setClientKey(value);
                report({
                  tls: {
                    rootCa,
                    clientCert,
                    clientKey: value,
                    enableMtls,
                    verifyNameOnConnect: verifyName,
                  },
                });
              }}
              secret
            />

            <div className="space-y-2">
              <Checkbox
                label="Mutual TLS"
                hint="Required when the router runs with enable_mtls"
                checked={enableMtls}
                onChange={(on) => {
                  setEnableMtls(on);
                  report({
                    tls: {
                      rootCa,
                      clientCert,
                      clientKey,
                      enableMtls: on,
                      verifyNameOnConnect: verifyName,
                    },
                  });
                }}
              />
              <Checkbox
                label="Verify the certificate name"
                hint="Turn off to reach a service certificate over localhost"
                checked={verifyName}
                onChange={(on) => {
                  setVerifyName(on);
                  report({
                    tls: { rootCa, clientCert, clientKey, enableMtls, verifyNameOnConnect: on },
                  });
                }}
              />
            </div>

            {enableMtls && !clientCert ? (
              <Badge tone="warn">Mutual TLS needs a client certificate and key</Badge>
            ) : null}
          </div>
        </Disclosure>
      ) : null}

      <Disclosure summary="Advanced" meta={mode}>
        <div className="space-y-4 pt-3 pl-5">
          <Field label="Mode" hint="How the explorer joins the network">
            <SegmentedControl
              label="Session mode"
              segments={MODES}
              value={mode}
              onChange={(value) => {
                setMode(value);
                report({ mode: value });
              }}
            />
          </Field>

          <Field label="Discovery" hint="How the explorer finds other nodes">
            <div className="space-y-2">
              <Checkbox
                label="Multicast scouting"
                checked={multicast}
                onChange={(on) => {
                  setMulticast(on);
                  report({ multicastScouting: on });
                }}
              />
              <Checkbox
                label="Gossip scouting"
                checked={gossip}
                onChange={(on) => {
                  setGossip(on);
                  report({ gossipScouting: on });
                }}
              />
              <Checkbox
                label="Answer scouts from other nodes"
                hint="Off keeps the explorer invisible to discovery"
                checked={options.multicastListen ?? false}
                onChange={(on) => {
                  const next = { ...options, multicastListen: on };
                  setOptions(next);
                  report({ options: next });
                }}
              />
            </div>
          </Field>

          <Field label="Connect timeout" hint="Milliseconds. Blank leaves Zenoh's default">
            <Input
              size="lg"
              value={options.connectTimeoutMs?.toString() ?? ""}
              onChange={(event) => {
                const raw = event.target.value.trim();
                const parsed = raw === "" ? null : Number(raw);
                const next = {
                  ...options,
                  connectTimeoutMs: parsed !== null && Number.isFinite(parsed) ? parsed : null,
                };
                setOptions(next);
                report({ options: next });
              }}
              placeholder="Zenoh default"
              inputMode="numeric"
              mono
            />
          </Field>

          <Field label="Retry" hint="Backoff when the router is unreachable">
            <div className="flex items-center gap-3">
              <Checkbox
                label="Retry automatically"
                checked={options.retry !== null}
                onChange={(on) => {
                  const next = {
                    ...options,
                    retry: on
                      ? { periodInitMs: 1000, periodMaxMs: 5000, periodIncreaseFactor: 2 }
                      : null,
                  };
                  setOptions(next);
                  report({ options: next });
                }}
              />
              {options.retry ? (
                <span className="numeric text-tiny text-ink-faint">
                  {options.retry.periodInitMs}ms → {options.retry.periodMaxMs}ms, ×
                  {options.retry.periodIncreaseFactor}
                </span>
              ) : null}
            </div>
          </Field>

          <Field label="Raw config" hint="JSON5, merged first. For anything not covered above">
            <textarea
              value={advanced}
              onChange={(event) => {
                setAdvanced(event.target.value);
                report({ advancedJson5: event.target.value.trim() || null });
              }}
              rows={4}
              spellCheck={false}
              placeholder="{ transport: { unicast: { max_sessions: 100 } } }"
              className={cn(
                "numeric selectable rounded-control border-line bg-surface-2 w-full resize-y border p-3",
                "text-tiny text-ink placeholder:text-ink-faint outline-none",
                transitionFast,
                "focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-subtle)]",
              )}
            />
          </Field>
        </div>
      </Disclosure>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-baseline gap-2">
        <span className="text-small text-ink font-medium">{label}</span>
        <span className="text-tiny text-ink-faint">{hint}</span>
      </span>
      {children}
    </label>
  );
}

function Checkbox({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-baseline gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent size-3.5 cursor-pointer"
      />
      <span className="text-small text-ink-muted">{label}</span>
      {hint ? <span className="text-tiny text-ink-faint">{hint}</span> : null}
    </label>
  );
}
