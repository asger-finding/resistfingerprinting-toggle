import {
	DISABLED_HOSTS,
	ICONS,
	RFP_DEFAULT_STATE,
	TRANSLATIONS,
	VALID_PROTOCOLS
} from './constants.js';

// We use a cache to avoid querying the storage every time we need to check if a host is disabled
let disabledHostsCache: string[] = [];

/** Ensure that disabled hosts is an array in local extension storage */
async function ensureDisabledHosts() {
	const disabledHosts: string[] = (await browser.storage.local.get([DISABLED_HOSTS]))[DISABLED_HOSTS];

	if (disabledHosts instanceof Array) disabledHostsCache = disabledHosts;
	else browser.storage.local.set({ [DISABLED_HOSTS]: [] });
}

/**
 * Get the focused tab's URL.
 * @returns The URL of the focused tab.
 */
async function getCurrentTabURL(): Promise<string | undefined> {
	const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
	return currentTab.url;
}

/**
 * Update the extension icon and title to reflect the current RFP state.
 * 
 * Set privacy.resistFingerprinting accordingly.
 * @param isRFPEnabled - Whether resist fingerprinting should be enabled or not.
 */
function updateRFP(isRFPEnabled: boolean, host?: string) {
	browser.browserAction.setIcon({
		path: isRFPEnabled
			? ICONS.RFP_ENABLED
			: ICONS.RFP_DISABLED
	});
	browser.browserAction.setTitle({
		// Screen readers can see the title
		title: isRFPEnabled
			? browser.i18n.getMessage(TRANSLATIONS.TOOLTIP_DISABLE_RFP, host)
			: browser.i18n.getMessage(TRANSLATIONS.TOOLTIP_ENABLE_RFP, host)
	});
	browser.privacy.websites.resistFingerprinting.get({}).then(({ value }) => {
		if (value !== isRFPEnabled) browser.privacy.websites.resistFingerprinting.set({ value: isRFPEnabled });
	});
}

/**
 * Check the validity of the target URL by wrapping it in a try/catch statement.
 * 
 * Return its host or throw an error.
 * @param url - The URL string to check.
 * @returns URL host
 */
function handleURL(url: string): URL {
	try {
		return new URL(url);
	} catch (err) {
		// Realistically, this should never happen
		browser.browserAction.setIcon({ path: ICONS.RFP_DEFAULT });
		browser.browserAction.setTitle({ title: browser.i18n.getMessage(TRANSLATIONS.ERROR_INVALID_URL) });
		throw err;
	}
}

/**
 * Check if the given host has resist fingerprinting enabled.
 * @param host - The host to check.
 * @returns Whether the host is enabled or not.
 */
async function isRFPEnabledForHost(host: string): Promise<boolean> {
	const disabledHosts: string[] = disabledHostsCache.length
		? disabledHostsCache
		: (await browser.storage.local.get([DISABLED_HOSTS]))[DISABLED_HOSTS];

	return !disabledHosts.includes(host);
}

// Ensure that DISABLED_HOSTS is an array in local extension storage
await ensureDisabledHosts();

// Enable RFP when the extension runs
updateRFP(RFP_DEFAULT_STATE);

// Listen for the click event on the extension icon
browser.browserAction.onClicked.addListener(async() => {
	const url = await getCurrentTabURL();

	if (typeof url === 'string') {
		const urlObject = new URL(url);
		if (!VALID_PROTOCOLS.includes(urlObject.protocol)) return;

		const { host } = urlObject;
		const isHostRFPEnabled = await isRFPEnabledForHost(host);

		// We should not rely on the cache here as we will invalidate it either way.
		let disabledHosts = (await browser.storage.local.get([DISABLED_HOSTS]))[DISABLED_HOSTS];

		if (isHostRFPEnabled) disabledHosts.push(host);
		else disabledHosts = disabledHosts.filter((disabledHost: string) => disabledHost !== host);

		browser.storage.local.set({ [DISABLED_HOSTS]: disabledHosts });

		// Update the cache
		disabledHostsCache = disabledHosts;

		// Update resist fingerprinting for the focused tab
		updateRFP(!isHostRFPEnabled, host);
	}
});

/** Event handler for tab updates that can be adapted to multiple listeners. */
async function handleTabChange() {
	const url = await getCurrentTabURL();

	if (typeof url === 'string') {
		const urlObject = handleURL(url);

		// Grey out the extension icon and set the title to unavailable, if the current tab is not a valid protocol
		if (!VALID_PROTOCOLS.includes(urlObject.protocol)) {
			browser.browserAction.setIcon({ path: ICONS.RFP_DEFAULT });
			browser.browserAction.setTitle({ title: browser.i18n.getMessage(TRANSLATIONS.TOOLTIP_RFP_UNAVAILABLE) });
			return;
		}

		const { host } = urlObject;
		const isHostRFPEnabled = await isRFPEnabledForHost(host);

		updateRFP(isHostRFPEnabled, host);
	}
}

// Listen to tab updates
browser.tabs.onUpdated.addListener(handleTabChange);
browser.tabs.onActivated.addListener(handleTabChange);
