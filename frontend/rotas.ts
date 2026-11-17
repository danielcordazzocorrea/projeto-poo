export type Area = 'home' | 'investments' | 'pix' | 'profile' | 'history' | 'currencies';
export type InvestmentCategory = 'transferir' | 'acoes' | 'compradas' | null;
export type AccountRoute = { area: Area; category: InvestmentCategory };

const areaPaths: Record<Area, string> = {
  home: '/',
  investments: '/investimentos',
  pix: '/pix',
  profile: '/perfil',
  history: '/historico',
  currencies: '/moedas',
};

const investmentPaths: Record<Exclude<InvestmentCategory, null>, string> = {
  transferir: '/investimentos/transferir',
  acoes: '/investimentos/acoes',
  compradas: '/investimentos/compradas',
};

export function pathForRoute(route: AccountRoute): string {
  return route.area === 'investments' && route.category
    ? investmentPaths[route.category]
    : areaPaths[route.area];
}

export function routeFromPath(pathname: string): AccountRoute {
  const path = pathname.replace(/\/+$/, '') || '/';
  const category = (Object.entries(investmentPaths) as [Exclude<InvestmentCategory, null>, string][])
    .find(([, value]) => value === path)?.[0];
  if (category) return { area: 'investments', category };
  const area = (Object.entries(areaPaths) as [Area, string][]).find(([, value]) => value === path)?.[0];
  return { area: area ?? 'home', category: null };
}
