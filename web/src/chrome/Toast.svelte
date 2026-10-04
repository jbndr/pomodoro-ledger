<script>
  import { notice } from "./notice.svelte";
</script>

<div class="toast" id="toast" role="status" hidden={!notice.shown}>{notice.msg}</div>
