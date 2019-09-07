import { Err, ErrorCode } from "@padloc/core/src/error";
import { translate as $l } from "@padloc/locale/src/translate";
import { app, router } from "../init";
import { alert, confirm } from "../dialog";
// import { notify } from "../elements/notification";

type Constructor<T> = new (...args: any[]) => T;

export interface ErrorHandling {
    handleError(error: any): Promise<boolean>;
}

export function ErrorHandling<B extends Constructor<Object>>(baseClass: B) {
    return class extends baseClass implements ErrorHandling {
        constructor(...args: any[]) {
            super(...args);
            window.addEventListener("error", (e: ErrorEvent) => this.handleError(e.error));
            window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => this.handleError(e.reason));
        }

        async handleError(error: any) {
            error =
                error instanceof Err
                    ? error
                    : error instanceof Error
                    ? new Err(ErrorCode.UNKNOWN_ERROR, error.message, { error })
                    : new Err(ErrorCode.UNKNOWN_ERROR, error.toString());

            switch (error.code) {
                case ErrorCode.FAILED_CONNECTION:
                    // A failed connection is interpreted as the user simply being offline,
                    // which is indicated in another place in the UI
                    return true;
                case ErrorCode.INVALID_SESSION:
                case ErrorCode.SESSION_EXPIRED:
                    await app.logout();
                    await alert($l("Your session has expired. Please log in again!"), { preventAutoClose: true });
                    router.go("login");
                    return true;
                default:
                    await confirm(
                        error.message || $l("Something went wrong. Please try again later!"),
                        $l("Contact Support"),
                        $l("Dismiss"),
                        { title: "Error", type: "warning", preventAutoClose: true }
                    ).then(confirmed => {
                        if (confirmed) {
                            window.open(`mailto:support@padloc.io?subject=Server+Error+(${error.code})`);
                        }
                    });
                    return true;
            }

            return false;
        }
    };
}