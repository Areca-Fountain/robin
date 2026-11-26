import { withApiLog } from "@/robin-api/log";
import { GET as list } from "@/robin-api/handlers/letters";
import { POST as issue } from "@/robin-api/handlers/issue";

export const GET = withApiLog(list);
export const POST = withApiLog(issue);
