/**
 * Shallow-equality helpers for change detection on hot paths.
 * Avoid JSON.stringify in places that run per-node per-store-tick.
 */

export function shallowEqualArray<T>(a: readonly T[] | undefined, b: readonly T[] | undefined): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

export function shallowEqualRecord<T>(
	a: Record<string, T> | undefined,
	b: Record<string, T> | undefined
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	const aKeys = Object.keys(a);
	if (aKeys.length !== Object.keys(b).length) return false;
	for (const key of aKeys) {
		if (a[key] !== b[key]) return false;
	}
	return true;
}
