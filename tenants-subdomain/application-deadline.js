function applicationDeadline(sentAt, now = Date.now()) {
    const sent = sentAt ? Date.parse(sentAt) : NaN;
    if (!Number.isFinite(sent)) return { label: '7 days', expired: false };
    const day = 24 * 60 * 60 * 1000;
    const remaining = sent + 7 * day - now;
    if (remaining <= 0) return { label: '7 days', expired: true };
    return { label: remaining <= day ? '24 hours' : `${Math.min(7, Math.ceil(remaining / day))} days`, expired: false };
}
if (typeof module !== 'undefined') module.exports = { applicationDeadline };
