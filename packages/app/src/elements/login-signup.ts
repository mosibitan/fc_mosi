import "./password-input";
import { translate as $l } from "@padloc/locale/src/translate";
import { ErrorCode } from "@padloc/core/src/error";
import { AccountStatus, AuthPurpose } from "@padloc/core/src/auth";
import { router } from "../globals";
import { StartForm } from "./start-form";
import { Input } from "./input";
import { Button } from "./button";
import { alert, choose, dialog, prompt, confirm } from "../lib/dialog";
import "./logo";
import { customElement, property, query, state } from "lit/decorators.js";
import { css, html } from "lit";
import { completeAuthRequest, startAuthRequest } from "@padloc/core/src/platform";
import { mixins } from "../styles";
import { isTouch, passwordStrength } from "../lib/util";
import { generatePassphrase } from "@padloc/core/src/diceware";
import { GeneratorDialog } from "./generator-dialog";
import "./scroller";
import { Drawer } from "./drawer";
import { AccountProvisioning, ProvisioningStatus } from "@padloc/core/src/provisioning";
import "./rich-content";
import { displayProvisioning } from "../lib/provisioning";
import { StartAuthRequestResponse } from "@padloc/core/src/api";
import { Confetti } from "./confetti";
import { singleton } from "../lib/singleton";
import { PBES2Container } from "@padloc/core/src/container";
import { importLegacyContainer } from "../lib/import";
import { ACCOUNT_EMAIL_MAX_LENGTH, ACCOUNT_NAME_MAX_LENGTH } from "@padloc/core/src/account";
import { base64ToString } from "@padloc/core/src/encoding";

@customElement("pl-login-signup")
export class LoginOrSignup extends StartForm {
    readonly routePattern = /^(start|login|signup)(?:\/(consent|choose-password|confirm-password|success))?/;

    @property({ type: Boolean })
    asAdmin = false;

    @state()
    private _page = "";

    @state()
    private _step = "";

    @state()
    private _password: string = "";

    @state()
    private _loginError: string = "";

    private _loginFailedCount = 0;

    @query("#emailInput")
    private _emailInput: Input;

    @query("#nameInput")
    private _nameInput: Input;

    @query("#tosCheckbox")
    private _tosCheckbox: HTMLInputElement;

    @query("#loginPasswordInput")
    private _loginPasswordInput: Input;

    @query("#repeatPasswordInput")
    private _repeatPasswordInput: Input;

    @query("#submitEmailButton")
    private _submitEmailButton: Button;

    @query("#loginButton")
    private _loginButton: Button;

    @query("#consentDrawer")
    private _consentDrawer: Drawer;

    @query("#confirmPasswordButton")
    private _confirmPasswordButton: Button;

    @query("#masterPasswordDrawer")
    private _masterPasswordDrawer: Drawer;

    @singleton("pl-confetti")
    private _confetti: Confetti;

    @dialog("pl-generator-dialog")
    private _generatorDialog: GeneratorDialog;

    async reset() {
        await this.updateComplete;
        this._emailInput.value = router.params.email || "";
        this._nameInput.value = router.params.name || "";
        this._loginPasswordInput.value = "";
        this._repeatPasswordInput.value = "";
        this._submitEmailButton.stop();
        this._tosCheckbox.checked = false;
        super.reset();
    }

    async handleRoute([page, step]: [string, string]) {
        if (!this._authToken && !(page === "start" || (page === "signup" && step === "success"))) {
            this.redirect("start");
            return;
        }

        if (page === "signup" && !step) {
            this.redirect("signup/consent");
            return;
        }

        if (page === "signup" && step === "confirm-password" && !this._password) {
            this.redirect("signup/choose-password");
            return;
        }

        this._page = page;
        this._step = step;

        if (this._email && this._emailInput && !this._emailInput.value) {
            this._emailInput.value = this._email;
        }

        if (this._name && this._nameInput && !this._nameInput.value) {
            this._nameInput.value = this._name;
            this._consentDrawer.updateInnerSize();
        }

        if (this._page === "start") {
            const { pendingAuth, pendingAuthData } = await this._getPendingAuth();
            if (pendingAuth) {
                this._emailInput.value = pendingAuth.email;
                this._submitEmailButton.stop();
                this._submitEmail(pendingAuth, pendingAuthData);
            }
        }

        if (this._page === "signup" && this._step === "consent") {
            this._nameInput?.focus();
        }

        if (this._page === "signup" && this._step === "choose-password") {
            !this._password ? this._generatePassphrase() : this._revealPassphrase();
        }

        if (this._page === "signup" && this._step === "success") {
            this._confetti.pop();
        }

        if (this._page === "login") {
            this._loginPasswordInput?.focus();
        }
    }

    private async _getPendingAuth() {
        if (!this.router.params.pendingAuth) {
            return {};
        }

        try {
            const pendingAuth = await this.app.storage.get(StartAuthRequestResponse, this.router.params.pendingAuth);
            const pendingAuthData = this.router.params.pendingAuthData
                ? JSON.parse(base64ToString(this.router.params.pendingAuthData))
                : undefined;
            return { pendingAuth, pendingAuthData };
        } catch (e) {
            return {};
        }
    }

    private async _authenticate({
        email,
        pendingRequest: req,
        pendingRequestData,
        authenticatorIndex = 0,
    }: {
        email: string;
        authenticatorIndex?: number;
        pendingRequest?: StartAuthRequestResponse;
        pendingRequestData?: any;
    }): Promise<{
        email: string;
        token: string;
        accountStatus: AccountStatus;
        provisioning: AccountProvisioning;
        deviceTrusted: boolean;
        legacyData?: PBES2Container;
    } | null> {
        try {
            if (!req) {
                req = await startAuthRequest({
                    purpose: this.asAdmin ? AuthPurpose.AdminLogin : AuthPurpose.Login,
                    email: this._emailInput.value,
                    authenticatorIndex,
                });
                await this.app.storage.save(req);
                this.router.setParams({ pendingAuth: req.id });
            }

            try {
                const res = await completeAuthRequest(req, pendingRequestData);
                return res;
            } finally {
                this.router.setParams({ pendingAuth: undefined, pendingAuthData: undefined });
                this.app.storage.delete(req);
            }
        } catch (e: any) {
            if (e.code === ErrorCode.NOT_FOUND) {
                await alert(e.message, { title: $l("Authentication Failed"), options: [$l("Cancel")] });
                return null;
            }

            const choice = await alert(e.message, {
                title: $l("Authentication Failed"),
                options: [$l("Try Again"), $l("Try Another Method"), $l("Cancel")],
            });
            switch (choice) {
                case 0:
                    return this._authenticate({ email, authenticatorIndex });
                case 1:
                    return this._authenticate({ email, authenticatorIndex: authenticatorIndex + 1 });
                default:
                    return null;
            }
        }
    }

    private async _submitEmail(pendingRequest?: StartAuthRequestResponse, pendingRequestData?: any): Promise<void> {
        if (this._submitEmailButton.state === "loading") {
            return;
        }

        if (!this._emailInput.reportValidity()) {
            return;
        }

        const email = this._emailInput.value;

        this._emailInput.blur();

        if (this._emailInput.invalid) {
            alert($l("Please enter a valid email address!"));
            this.rumble();
            this._emailInput.focus();
            return;
        }

        this._submitEmailButton.start();

        const authRes = await this._authenticate({ email, pendingRequest, pendingRequestData });

        if (!authRes) {
            this._submitEmailButton.fail();
            return;
        }

        this._submitEmailButton.success();

        if ([ProvisioningStatus.Unprovisioned, ProvisioningStatus.Suspended].includes(authRes.provisioning.status)) {
            await displayProvisioning(authRes.provisioning);
            return;
        }

        if (authRes.accountStatus === AccountStatus.Unregistered && authRes.legacyData) {
            this._migrateLegacyAccount(authRes);
            return;
        }

        router.go(
            authRes.accountStatus === AccountStatus.Active
                ? "login"
                : authRes.provisioning.skipTos
                ? "signup/choose-password"
                : "signup",
            {
                ...this.router.params,
                email,
                name: authRes.provisioning.name || "",
                authToken: authRes.token,
                deviceTrusted: authRes.deviceTrusted.toString(),
            }
        );
    }

    private async _accountDoesntExist(email: string) {
        const signup = await confirm(
            $l("An account with this email address does not exist!"),
            $l("Sign Up"),
            $l("Cancel"),
            {
                icon: "info",
            }
        );
        if (signup) {
            router.go("start", { email });
        }
    }

    private async _login(): Promise<void> {
        if (this._loginButton.state === "loading") {
            return;
        }

        if (!this._emailInput.reportValidity()) {
            return;
        }

        this._emailInput.blur();
        this._loginPasswordInput.blur();

        const email = this._emailInput.value;
        let password = this._loginPasswordInput.value;

        if (this._emailInput.invalid) {
            await alert($l("Please enter a valid email address!"));
            this.go("start");
            return;
        }

        if (!password) {
            this._loginError = $l("Please enter your master password!");
            this.rumble();
            this._loginPasswordInput.focus();
            return;
        }

        this._loginError = "";
        this._loginButton.start();
        try {
            let addTrustedDevice = false;
            if (!this._deviceTrusted) {
                addTrustedDevice = await confirm(
                    $l("Do you want to add this device as a trusted device?"),
                    $l("Yes"),
                    $l("No"),
                    { title: $l("Add Trusted Device") }
                );
            }
            await this.app.login({
                email,
                password,
                authToken: this._authToken,
                addTrustedDevice,
                asAdmin: this.asAdmin,
            });
            this._loginButton.success();
            const { email: _email, authToken, deviceTrusted, invite: _invite, ...params } = this.router.params;
            const invite = this._invite;
            this.go(invite ? `invite/${invite.orgId}/${invite.id}` : "items", params);
        } catch (e: any) {
            switch (e.code) {
                case ErrorCode.AUTHENTICATION_REQUIRED:
                    this._loginButton.stop();

                    await alert($l("We failed to verify your email address. Please start over!"), {
                        type: "warning",
                        title: $l("Authentication Failed"),
                    });

                    this.go("start", { email });

                    return;
                case ErrorCode.INVALID_CREDENTIALS:
                    this._loginError = $l("Wrong master password. Please try again!");
                    this._loginButton.fail();
                    this.rumble();

                    this._loginFailedCount++;
                    if (this._loginFailedCount > 2) {
                        const recover = await confirm(
                            $l("Can't remember your master password?"),
                            $l("Recover Account"),
                            $l("Try Again")
                        );
                        if (recover) {
                            router.go("recover", { email });
                        }
                    } else {
                        this._loginPasswordInput.focus();
                    }
                    return;
                case ErrorCode.INVALID_SESSION:
                    this._loginButton.stop();

                    await alert($l("We failed to verify your session. Please start over!"), {
                        type: "warning",
                        title: $l("Authentication Failed"),
                    });

                    try {
                        const { pendingAuth } = await this._getPendingAuth();
                        if (pendingAuth) {
                            this.router.setParams({ pendingAuth: undefined, pendingAuthData: undefined });
                            this.app.storage.delete(pendingAuth);
                        }
                    } catch (e) {}

                    await this.app.logout();

                    router.go("start", { email });
                    return;
                case ErrorCode.NOT_FOUND:
                    this._loginButton.fail();
                    this._accountDoesntExist(email);
                    return;
                default:
                    this._loginButton.stop();
                    try {
                        const { pendingAuth } = await this._getPendingAuth();
                        if (pendingAuth) {
                            this.router.setParams({ pendingAuth: undefined, pendingAuthData: undefined });
                            this.app.storage.delete(pendingAuth);
                        }
                    } catch (e) {}

                    await this.app.logout();

                    router.go("start", { email });
                    alert(e.message, { type: "warning" });
                    throw e;
            }
        }
    }

    private async _submitName() {
        this.go("signup/choose-password", { ...this.router.params, name: this._nameInput.value });
    }

    private async _generatePassphrase() {
        this._password = await generatePassphrase(4, " ", [this.app.state.device.locale]);
        this._masterPasswordDrawer.updateInnerSize();
        this._revealPassphrase();
    }

    private async _revealPassphrase(duration = 2000) {
        const wrapper = this.renderRoot.querySelector(".master-password")!;
        wrapper.classList.add("reveal");
        setTimeout(() => wrapper.classList.remove("reveal"), duration);
    }

    private async _editMasterPassword(): Promise<void> {
        const choice = await choose(
            $l("We recommend using a randomly generated password that is both strong and easy to remember."),
            [$l("Keep This One"), $l("Generate Another"), $l("Choose My Own")],
            { title: $l("Want A Different Master Password?") }
        );

        let newPwd;

        switch (choice) {
            case 0:
                break;
            case 1:
                newPwd = await this._generatorDialog.show();
                break;
            case 2:
                newPwd = await prompt(
                    $l("We recommend using a randomly generated password that is both strong and easy to remember."),
                    { title: $l("Choose Own Master Password"), label: $l("Enter Master Password"), type: "password" }
                );
                break;
        }

        if (newPwd) {
            const strength = await passwordStrength(newPwd);

            if (strength.score < 2) {
                const choice = await choose(
                    $l(
                        "The password you entered is weak which makes it easier for attackers to break " +
                            "the encryption used to protect your data. Try to use a longer password or include a " +
                            "variation of uppercase, lowercase and special characters as well as numbers!"
                    ),
                    [$l("Choose Different Password"), $l("Use Anyway")],
                    {
                        type: "warning",
                        title: $l("WARNING: Weak Password"),
                        icon: null,
                        preventDismiss: true,
                    }
                );
                if (choice === 0) {
                    return this._editMasterPassword();
                }
            }

            this._password = newPwd;
            this._revealPassphrase();
        }
    }

    private _submitPassword() {
        this.go("signup/confirm-password");
        this._repeatPasswordInput.focus();
    }

    private async _confirmPassword() {
        if (this._confirmPasswordButton.state === "loading") {
            return;
        }

        if (this._password !== this._repeatPasswordInput.value) {
            await alert($l("You didn't repeat your master password correctly. Try again!"), {
                type: "warning",
                title: "Incorrect Master Password",
            });
            return;
        }

        const email = this._email;
        const name = this._name;
        const password = this._password;

        this._confirmPasswordButton.start();

        try {
            await this.app.signup({ email, password, name, authToken: this._authToken });
            this._confirmPasswordButton.success();
            const { email: _email, name: _name, authToken, deviceTrusted, ...params } = this.router.params;
            this.go("signup/success", params);
        } catch (e) {
            this._confirmPasswordButton.fail();
            switch (e.code) {
                case ErrorCode.ACCOUNT_EXISTS:
                    this._accountExists();
                    return;
                default:
                    alert(e.message || $l("Server error."), { type: "warning" });
                    throw e;
            }
        }

        this._password = "";
    }

    private _done() {
        const invite = this._invite;
        const { invite: _inv, ...params } = this.router.params;
        this.go(invite ? `invite/${invite.orgId}/${invite.id}` : "items", params);
    }

    private async _accountExists() {
        const choice = await choose(
            $l("An account with this email address already exists!"),
            [$l("Login"), $l("Change Email")],
            { type: "warning", title: $l("Account Exists") }
        );
        if (choice === 0) {
            router.go("login");
        } else {
            const { authToken, ...params } = router.params;
            router.go("signup", params);
            this._emailInput.focus();
        }
    }

    protected async _migrateLegacyAccount(authResponse: {
        email: string;
        legacyData?: PBES2Container;
        token: string;
    }): Promise<boolean> {
        const legacyData = authResponse.legacyData!;

        this._submitEmailButton.start();

        const choice = await alert(
            $l(
                "You don't have a Padloc 4 account yet but we've found " +
                    "an account from an older version. " +
                    "Would you like to migrate your account to Padloc 4 now?"
            ),
            {
                title: "Account Migration",
                icon: "user",
                options: [$l("Migrate"), $l("Learn More"), $l("Cancel")],
            }
        );

        if (choice === 1) {
            window.open("https://mosi.link/help/migrate-v3", "_system");
            return this._migrateLegacyAccount(authResponse);
        } else if (choice === 2) {
            this._submitEmailButton.stop();
            return false;
        }

        const password = await prompt($l("Please enter your master password!"), {
            title: $l("Migrating Account"),
            placeholder: $l("Enter Master Password"),
            confirmLabel: $l("Submit"),
            type: "password",
            preventAutoClose: true,
            validate: async (password: string) => {
                try {
                    await legacyData.unlock(password);
                } catch (e) {
                    throw $l("Wrong password! Please try again!");
                }
                return password;
            },
        });
        const items = await importLegacyContainer(legacyData);

        if (items && password) {
            await this.app.signup({ email: authResponse.email, password, name: "", authToken: authResponse.token });
            await this.app.addItems(items, this.app.mainVault!);
            const deleteLegacy = await confirm(
                $l(
                    "Your account and all associated data was migrated successfully! Do you want to delete your old account now?"
                ),
                $l("Yes"),
                $l("No"),
                { title: $l("Delete Legacy Account"), icon: "delete", preventAutoClose: true }
            );

            if (deleteLegacy) {
                await this.app.api.deleteLegacyAccount();
            }

            await alert(
                $l(
                    "All done! Please note that you won't be able to access your Padloc 4 account " +
                        "with older versions of the app, so please make sure you have the latest version installed " +
                        "on all your devices! (You can find download links for all platforms at " +
                        "https://mosi.link/downloads/). Enjoy using Padloc 4!"
                ),
                {
                    title: $l("Migration Complete"),
                    type: "success",
                }
            );

            const { email: _email, name: _name, authToken, deviceTrusted, ...params } = this.router.params;
            this.go("signup/success", params);
            this._submitEmailButton.success();
            return true;
        } else {
            alert($l("Unfortunately we could not complete migration of your data."), {
                type: "warning",
            });
            this._submitEmailButton.stop();
            return false;
        }
    }

    static styles = [
        ...StartForm.styles,
        css`
            pl-input:not([focused]) + .hint,
            pl-password-input:not([focused]) + .hint {
                opacity: 0.5;
                text-shadow: none;
            }

            .master-password {
                position: relative;
                background: var(--shade-2-color);
                font-family: var(--font-family-mono);
                font-size: var(--font-size-medium);
                overflow-wrap: break-word;
                text-align: center;
                padding: 1em;
                border: solid 1px var(--color-shade-2);
                border-radius: 0.5em;
                background: var(--color-background);
            }

            .master-password-cover {
                ${mixins.fullbleed()};
                height: 2em;
                line-height: 2em;
                margin: auto;
                text-shadow: none;
                color: var(--color-shade-6);
            }

            .master-password:hover {
                background: var(--shade-3-color);
            }

            .master-password > * {
                transition: transform 0.2s cubic-bezier(1, -0.3, 0, 1.3), opacity 0.2s;
            }

            .master-password:not(:hover):not(.reveal) .master-password-value,
            .master-password:hover .master-password-cover,
            .master-password.reveal .master-password-cover {
                opacity: 0;
                transform: scale(0);
            }
        `,
    ];

    render() {
        const invite = this._invite;
        return html`
            <div class="fullbleed scrolling">
                <div class="fill centering double-padded vertical layout">
                    <pl-logo class="animated"></pl-logo>

                    ${this.asAdmin
                        ? html`
                              <div class="animated subtle" style="margin-top: -2em; margin-bottom: 2em;">
                                  ${$l("Admin Portal")}
                              </div>
                          `
                        : ""}
                    ${invite
                        ? html`
                              <div
                                  class="double-padded small box background animated"
                                  style="max-width: 25em; margin-bottom: 1.5em"
                              >
                                  Hi there! <strong>${invite.invitor}</strong>
                                  <span>${$l("has invited you to join their organization")}</span>
                                  <strong class="highlighted">${invite.orgName}</strong>.
                                  ${this._page === "signup"
                                      ? html`
                                            Before you can accept, we'll need to <strong>create an account</strong> for
                                            you. This will only take a few moments.
                                        `
                                      : html`
                                            Before you can accept, you'll need to
                                            <strong>login</strong>.
                                        `}
                                  ${this._emailInput && invite.email !== this._emailInput.value
                                      ? html`
                                            <div class="negative highlight top-margined">
                                                <strong>Warning:</strong> This invite is meant for
                                                <strong>${invite.email}</strong>, but you've entered
                                                <strong>${this._emailInput.value}</strong>.
                                                <a
                                                    href="#"
                                                    @click=${() => {
                                                        this.go("start", {
                                                            ...this.router.params,
                                                            email: invite.email,
                                                        });
                                                        this._emailInput.value = invite.email;
                                                    }}
                                                >
                                                    <pl-icon icon="arrow-right" class="inline"></pl-icon>Switch to
                                                    ${invite.email}
                                                </a>
                                            </div>
                                        `
                                      : ""}
                              </div>
                          `
                        : html``}

                    <form class="double-padded animated" style="box-sizing: border-box" autocomplete="off">
                        <pl-drawer .collapsed=${this._page === "signup" && this._step === "success"} class="springy">
                            <div class="vertical layout" style="flex-direction: column-reverse">
                                <pl-input
                                    id="emailInput"
                                    type="email"
                                    required
                                    select-on-focus
                                    maxlength=${ACCOUNT_EMAIL_MAX_LENGTH}
                                    .label=${$l("Email Address")}
                                    @enter=${() => this._submitEmail()}
                                    ?disabled=${this._page !== "start"}
                                    @input=${() => this.requestUpdate()}
                                >
                                </pl-input>

                                <div class="hint">${$l("Welcome! Please enter your email address to continue.")}</div>
                            </div>
                        </pl-drawer>

                        <pl-drawer .collapsed=${this._page !== "start"} class="springy">
                            <div class="spacer"></div>

                            <div class="horizontal spacing evenly stretching layout">
                                <pl-button
                                    id="submitEmailButton"
                                    @click=${() => this._submitEmail()}
                                    ?disabled=${!this._emailInput?.value}
                                >
                                    <div>${$l("Continue")}</div>
                                    <pl-icon icon="forward" class="left-margined"></pl-icon>
                                </pl-button>
                            </div>
                        </pl-drawer>

                        <pl-drawer
                            .collapsed=${this._page !== "signup" || this._step !== "consent"}
                            class="springy"
                            id="consentDrawer"
                        >
                            <div class="spacer"></div>

                            <div class="hint">
                                ${$l("Hi there,")} <strong class="break-words">${this._nameInput?.value || $l("Stranger")}</strong>!
                                ${$l("Let's set up your brand new {0} account! (This will only take a few moments.)", process.env.PL_APP_NAME!)}
                            </div>

                            <pl-input
                                id="nameInput"
                                maxlength=${ACCOUNT_NAME_MAX_LENGTH}
                                .label=${$l("Your Name (Optional)")}
                                @enter=${() => this._tosCheckbox?.focus()}
                                ?disabled=${this._page !== "signup" || this._step !== "consent"}
                                @input=${() => {
                                    this.requestUpdate();
                                    this._consentDrawer.updateInnerSize();
                                    this._masterPasswordDrawer.updateInnerSize();
                                }}
                            >
                            </pl-input>

                            <div class="spacer"></div>

                            <div class="small padded">
                                <label>
                                    <input type="checkbox" id="tosCheckbox" @input=${() => this.requestUpdate()} />
                                    ${$l("I have read and agree to the")}
                                    <a href="${process.env.PL_TERMS_OF_SERVICE || "#"}">${$l("Terms of Service")}</a>
                                </label>
                            </div>

                            <div class="spacer"></div>

                            <div class="horizontal center-aligning stretching spacing layout">
                                <pl-button class="tiny transparent" @click=${() => this.go("start")}>
                                    <pl-icon icon="backward" class="right-margined"></pl-icon>
                                    <div>${$l("Change Email")}</div>
                                </pl-button>
                                <pl-button @click=${() => this._submitName()} ?disabled=${!this._tosCheckbox?.checked}>
                                    <div>${$l("Create Account")}</div>
                                    <pl-icon icon="forward" class="left-margined"></pl-icon>
                                </pl-button>
                            </div>
                        </pl-drawer>

                        <pl-drawer .collapsed=${this._page !== "login"} class="springy">
                            <div class="spacer"></div>

                            <pl-password-input
                                id="loginPasswordInput"
                                required
                                select-on-focus
                                .label=${$l("Master Password")}
                                class="bottom-margined"
                                @enter=${() => this._login()}
                                @input=${() => this.requestUpdate()}
                            >
                            </pl-password-input>

                            ${this._loginError
                                ? html`
                                      <div class="negative inverted padded text-centering bottom-margined card">
                                          ${this._loginError}
                                      </div>
                                  `
                                : ""}

                            <div class="horizontal spacing evenly stretching layout">
                                <pl-button
                                    id="loginButton"
                                    @click=${() => this._login()}
                                    ?disabled=${!this._loginPasswordInput?.value}
                                    class="primary"
                                >
                                    <pl-icon icon="login" class="right-margined"></pl-icon>
                                    <div>${$l("Login")}</div>
                                </pl-button>
                            </div>
                        </pl-drawer>

                        <pl-drawer
                            .collapsed=${this._page !== "signup" ||
                            !["choose-password", "confirm-password"].includes(this._step)}
                            class="springy"
                            id="masterPasswordDrawer"
                        >
                            <div class="padded spacer"></div>

                            <div class="text-centering section-header">
                                <div>
                                    <div class="small subtle">
                                        ${this._nameInput?.value ? `${this._nameInput.value}, ` : ""}
                                        ${$l("Say hello to your")}
                                    </div>
                                    <div class="large bold">${$l("Master Password")}</div>
                                    <pl-icon class="tiny subtle" icon="arrow-down"></pl-icon>
                                </div>
                            </div>

                            <div class="master-password margined">
                                <div class="master-password-value">
                                    <span>${this._password}</span>
                                </div>

                                <div class="master-password-cover">
                                    ${isTouch() ? $l("[Tap To Reveal]") : $l("[Hover To Reveal]")}
                                </div>
                            </div>
                        </pl-drawer>

                        <pl-drawer
                            class="springy"
                            .collapsed=${this._page !== "signup" || this._step !== "choose-password"}
                        >
                            <div class="horizontally-margined hint">
                                <div>
                                    ${$l(
                                        "This random passphrase was generated just for you and is designed " +
                                            "to be both secure and easy to remember."
                                    )}
                                </div>
                            </div>

                            <div class="top-margined tiny text-centering subtle">${$l("Don't like it?")}</div>

                            <div class="centering horizontal layout">
                                <pl-button class="tiny ghost" @click=${this._generatePassphrase}>
                                    <pl-icon icon="refresh" class="right-margined"></pl-icon>
                                    ${$l("Try Another One")}
                                </pl-button>
                                <div class="small double-margined">or</div>
                                <pl-button class="tiny ghost" @click=${this._editMasterPassword}>
                                    <pl-icon icon="edit" class="right-margined"></pl-icon>
                                    ${$l("Choose Your Own")}
                                </pl-button>
                            </div>

                            <div class="padded spacer"></div>

                            <div class="center-aligning spacing horizontal layout">
                                <pl-button class="tiny transparent" @click=${() => this.go("signup/consent")}>
                                    <pl-icon icon="backward" class="right-margined"></pl-icon>
                                    <div>${$l("Change Name")}</div>
                                </pl-button>
                                <pl-button class="stretch" @click=${() => this._submitPassword()}>
                                    <div>${$l("Continue")}</div>
                                    <pl-icon icon="forward" class="left-margined"></pl-icon>
                                </pl-button>
                            </div>
                        </pl-drawer>

                        <pl-drawer
                            .collapsed=${this._page !== "signup" || this._step !== "confirm-password"}
                            class="springy"
                        >
                            <div class="spacer"></div>

                            <pl-password-input
                                id="repeatPasswordInput"
                                required
                                .label=${$l("Repeat Master Password")}
                                class="repeat-master-password"
                                @enter=${() => this._confirmPassword()}
                                @focus=${() => this._revealPassphrase()}
                            >
                            </pl-password-input>

                            <div class="hint margined padded">
                                ${$l(
                                    "Your master password is the last password you'll ever have to remember! " +
                                        "Please memorize it and never reveal it to anyone - not even us! " +
                                        "We recommend writing it down on a piece of paper and " +
                                        "storing it somewhere safe, at least until you have it safely memorized."
                                )}
                            </div>

                            <div class="center-aligning spacing horizontal layout">
                                <pl-button class="tiny transparent" @click=${() => this.go("signup/choose-password")}>
                                    <pl-icon icon="backward" class="right-margined"></pl-icon>
                                    <div>${$l("Change Password")}</div>
                                </pl-button>
                                <pl-button
                                    id="confirmPasswordButton"
                                    class="stretch"
                                    @click=${() => this._confirmPassword()}
                                >
                                    <div>${$l("Continue")}</div>
                                    <pl-icon icon="forward" class="left-margined"></pl-icon>
                                </pl-button>
                            </div>
                        </pl-drawer>

                        <pl-drawer class="springy" .collapsed=${this._page !== "signup" || this._step !== "success"}>
                            <div class="huge spacer"></div>
                            <div class="big highlighted text-centering">
                                ${$l("All set!")} <pl-icon icon="celebrate" class="inline"></pl-icon>
                            </div>
                            <div class="padded bottom-margined text-centering">
                                ${$l(
                                    "Your account was created successfully. Enjoy using {0}!",
                                    process.env.PL_APP_NAME!
                                )}
                            </div>
                            <pl-button class="primary" @click=${() => this._done()}>
                                <div>${$l("Get Started")}</div>
                                <pl-icon icon="arrow-right" class="left-margined"></pl-icon>
                            </pl-button>
                        </pl-drawer>
                    </form>
                </div>
            </div>
        `;
    }
}
