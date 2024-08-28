import { App } from "@padloc/core/src/app";
import { getPlatform } from "@padloc/core/src/platform";
import { Router } from "./lib/route";
import { AjaxSender } from "./lib/ajax";
console.log("PL_SERVER_URL", process.env.PL_SERVER_URL);
const sender = new AjaxSender(process.env.PL_SERVER_URL!);
export const app = (window.app = new App(sender));
export const router = (window.router = new Router());
window.getPlatform = getPlatform;
