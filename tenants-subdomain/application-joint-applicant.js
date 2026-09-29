(function (root) {
    function jointApplicantText(existing, applicant) {
        const saved = String(existing || '').trim();
        const name = String(applicant?.name || '').trim();
        if (!name || (saved && saved.toLocaleLowerCase('en-GB') !== name.toLocaleLowerCase('en-GB'))) return saved;
        const rawDate = String(applicant.date_of_birth || '');
        const iso = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
        const uk = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const date = iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : uk ? rawDate : '';
        return date ? `${name} - ${date}` : saved || name;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = jointApplicantText;
    else root.jointApplicantText = jointApplicantText;
})(typeof window !== 'undefined' ? window : globalThis);
