const mcaLegacyDetail = /^https:\/\/px\.chinanpo\.mca\.gov\.cn\/zpxx\/view\/(\d+)\/?$/;

export function jobSourceUrl(url: string): string {
  const mca = url.match(mcaLegacyDetail);
  return mca ? `https://px.chinanpo.mca.gov.cn/website/talentDetail?id=${encodeURIComponent(btoa(mca[1]))}` : url;
}
