/**
 * Thin helpers over window.dataverseAPI (Web API). The tool only sends GET requests.
 */

export type DvRecord = Record<string, any>;

/**
 * Relative Web API GET. The ToolBox already sends Prefer: odata.include-annotations="*";
 * passing extra headers would trigger a consent prompt.
 */
export async function getJson<T = any>(path: string): Promise<T> {
    return (await window.dataverseAPI.queryData(path)) as T;
}

export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    const message = (error as any)?.message ?? (error as any)?.error?.message;
    return typeof message === 'string' ? message : String(error);
}

/** The ToolBox rejects a response over 16 MB with this message. */
export const isTooLarge = (error: unknown) => /exceeds the maximum size/i.test(errorMessage(error));

export class StoppedError extends Error {
    constructor() {
        super('Stopped');
        this.name = 'StoppedError';
    }
}

/** A ToolBox call cannot be cancelled: Stop gives the hand back at once and the late answer is ignored. */
export function stoppable<T>(call: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const stop = () => reject(new StoppedError());
        if (signal.aborted) stop();
        else signal.addEventListener('abort', stop, { once: true });
        call.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
    });
}

/** The Web API returns the paging cookie in a <cookie pagingcookie="..."> element, URL-encoded twice. */
export function pagingCookie(annotation: string | undefined): string | undefined {
    const encoded = annotation?.match(/\spagingcookie="([^"]*)"/i)?.[1];
    return encoded ? decodeURIComponent(decodeURIComponent(encoded)) : undefined;
}

export const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
