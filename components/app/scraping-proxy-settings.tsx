"use client";
import { useEffect, useState } from "react";
import { Globe, Check, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SOURCES_META } from "@/lib/sources-meta";
import { DEFAULT_SCRAPING_PROXY, SCRAPING_PROXY_TARGETS, type PublicScrapingProxyConfig, type ScrapingProxyMode } from "@/lib/scraping-proxy";

const sources = SOURCES_META.filter(s => Object.hasOwn(SCRAPING_PROXY_TARGETS, s.id));
export function ScrapingProxySettings() {
  const [config, setConfig] = useState<PublicScrapingProxyConfig>({ ...DEFAULT_SCRAPING_PROXY, hasKey: false, keySource: null });
  const [saved, setSaved] = useState<PublicScrapingProxyConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  useEffect(() => {
    fetch("/api/settings/scraping-proxy", { cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { setConfig(data); setSaved(data); })
      .catch(() => setError("Impossible de charger les paramètres Bright Data."));
  }, []);
  const dirty = !!apiKey || JSON.stringify(config) !== JSON.stringify(saved);
  async function call(action: "save" | "verify" | "clear-key") {
    setBusy(true); setError(""); setInfo("");
    try {
      const { hasKey: _hasKey, keySource: _keySource, ...settings } = config;
      const r = await fetch("/api/settings/scraping-proxy", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(action === "save" ? { ...settings, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) } : {}) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Impossible de modifier les paramètres Bright Data.");
      if (action === "verify") setInfo(data.message);
      else {
        const { ok: _ok, ...updated } = data;
        setConfig(updated); setSaved(updated); setApiKey("");
        setInfo(action === "clear-key" ? "Clé enregistrée supprimée et relais désactivé." : "Paramètres Bright Data enregistrés.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur réseau."); }
    finally { setBusy(false); }
  }
  return (
    <Card id="proxy-recherche" className="scroll-mt-28">
      <div className="mb-3 flex items-center gap-2"><Globe className="h-5 w-5 text-textSecondary" /><h3 className="text-h3">Proxy de recherche Bright Data</h3></div>
      <p className="mb-4 text-small text-textSecondary">Utilisez votre zone Web Unlocker API pour les pages publiques des sources choisies. Bright Data facture les appels selon votre contrat ; le plafond s'applique à chaque source et à chaque scan. Les limites habituelles du scan restent actives.</p>
      {!saved ? <Spinner /> : <>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-small" htmlFor="brightdata-mode">Utilisation
            <select id="brightdata-mode" className="mt-1 w-full rounded-md border border-border bg-surface p-2" value={config.mode} disabled={busy} onChange={e => setConfig({ ...config, mode: e.target.value as ScrapingProxyMode })}>
              <option value="off">Désactivé</option><option value="fallback">Seulement en cas de blocage</option><option value="always">Toujours pour les sources choisies</option>
            </select>
          </label>
          <label className="text-small" htmlFor="brightdata-zone">Zone Web Unlocker
            <Input id="brightdata-zone" className="mt-1" value={config.zone} disabled={busy} onChange={e => setConfig({ ...config, zone: e.target.value })} placeholder="Ex. jobup" spellCheck={false} />
          </label>
          <label className="text-small" htmlFor="brightdata-key">Clé API Bright Data
            <Input id="brightdata-key" className="mt-1" type="password" autoComplete="new-password" value={apiKey} disabled={busy} onChange={e => setApiKey(e.target.value)} placeholder={config.hasKey ? "Clé déjà configurée · laisser vide pour la conserver" : "Votre clé API"} />
            <span className="mt-1 block text-caption text-textSecondary">{config.keySource === "env" ? "Clé chargée depuis le fichier d'environnement local." : "Clé conservée dans la base locale ; jamais renvoyée par l'API des paramètres."}</span>
          </label>
          <label className="text-small" htmlFor="brightdata-limit">Plafond d'appels par source et par scan
            <Input id="brightdata-limit" className="mt-1" type="number" min={1} max={100} value={config.maxRequests} disabled={busy} onChange={e => setConfig({ ...config, maxRequests: Number(e.target.value) })} />
          </label>
        </div>
        <fieldset className="mt-4"><legend className="mb-2 text-small font-semibold">Sources à relayer</legend><div className="flex flex-wrap gap-x-5 gap-y-2">
          {sources.map(source => <label key={source.id} className="flex items-center gap-2 text-small"><input type="checkbox" disabled={busy} checked={config.sources.includes(source.id)} onChange={e => setConfig({ ...config, sources: e.target.checked ? [...config.sources, source.id] : config.sources.filter(id => id !== source.id) })} />{source.label}</label>)}
        </div></fieldset>
        <p className="mt-2 text-caption text-textSecondary">Cette sélection configure le relais ; les sources à scanner se choisissent dans Profil › Recherche. Les API authentifiées, Job-Room et LinkedIn restent en accès direct. Le profil, le CV et les clés des autres services ne sont pas transmis à Bright Data.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => call("save")} disabled={busy || !dirty}>{busy ? <Spinner size={16} /> : <Check className="h-4 w-4" />}Enregistrer le proxy</Button>
          <Button variant="secondary" onClick={() => call("verify")} disabled={busy || dirty || !config.hasKey || !config.zone}>Tester la connexion · 1 appel</Button>
          {config.keySource === "settings" && <Button variant="ghost" onClick={() => call("clear-key")} disabled={busy}>Supprimer la clé enregistrée</Button>}
        </div>
      </>}
      {info && <p role="status" className="mt-3 text-small text-success">{info}</p>}
      {error && <p role="alert" className="mt-3 flex items-center gap-2 text-small text-danger"><AlertCircle className="h-4 w-4" />{error}</p>}
    </Card>
  );
}
