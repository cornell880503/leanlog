import { startLogin } from "@/const";
import { toast } from "sonner";

/**
 * Start Manus login. If the platform login config (/api/platform/config.js)
 * did not load, show a message instead of throwing an uncaught error.
 */
export function beginLogin(): void {
  try {
    startLogin();
  } catch (err) {
    console.error("[login]", err);
    toast.error("登入設定沒有載入，請重新整理頁面再試一次");
  }
}
