<script>
  import { syncCopy } from "../lib/settings";

  let { api, version } = $props();

  const c = $derived.by(() => {
    version;
    const { Cloud, S } = api;
    return syncCopy(Cloud.state, Cloud.state === "off" && S.storeMode === "db", Cloud.email);
  });
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

  function signOut() {
    api.ls.set("pl.syncEmail", "");
    location.href = "/cdn-cgi/access/logout";
  }
</script>

<div class="group">
  <div class="card">
    <div class="toggle sync-row"><span><b id="syncTitle">{c.title}</b><small id="syncDetail">{c.detail}</small></span><span class="acts" id="syncActs">{#if c.acts === "signin"}<a class="btn small solid" href="/api/sync/login">Sign in</a>{:else if c.acts === "account"}<a class="btn small" href="/api/sync/export" download>Export</a>{#if !local}<button class="btn small" type="button" id="syncOut" onclick={signOut}>Sign out</button>{/if}{/if}</span></div>
  </div>
  <p class="hint" id="syncHint">{c.hint}</p>
</div>
