import { withApiLog } from "@/robin-api/log";
import { POST as confirmRevoke } from "@/robin-api/handlers/revoke-confirm";

export const POST = withApiLog(confirmRevoke);
