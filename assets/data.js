// Ukážkové dáta — nahraď reálnymi dátami z API neskôr.

const currentUser = {
  id: 'u1',
  name: 'Tomáš Krejčí',
  username: 'tomaskrejci',
  avatar: 'https://i.pravatar.cc/150?img=12',
  bio: 'Milovník kopcov a lesných chodníkov. 🌲',
  credit: 245,
  stats: { posts: 18, collections: 6, followers: 342, following: 128, kmWalked: 412 },
};

const collections = [
  {
    id: 'c1',
    title: 'Poklady Kutnohorska',
    author: { name: 'Vandro tím', avatar: 'https://i.pravatar.cc/150?img=5', verified: true },
    coverImage: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&h=600&fit=crop',
    createdAt: '2026-08-27T18:00:00Z',
    likes: 214, comments: 12, saved: false, liked: false, isNew: true,
    description: 'Chrám sv. Barbory, kostnice a vyhliadky nad riekou Vrchlicí. 5 zastávok, 8 km. Táto zbierka financuje obnovu značenia a nové informačné tabule na trase.',
    targetAmount: 45000, currentAmount: 31200,
  },
  {
    id: 'c2',
    title: 'Podél Labe z Poděbrad',
    author: { name: 'Eva Malá', avatar: 'https://i.pravatar.cc/150?img=32', verified: false },
    coverImage: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=800&h=600&fit=crop',
    createdAt: '2026-08-26T09:20:00Z',
    likes: 98, comments: 4, saved: true, liked: true, isNew: false,
    description: 'Pokojná cyklo-pěší trasa lemovaná topoly, ideální na víkendové odpoledne. Výťažok pôjde na opravu odpočinkových lavičiek pozdĺž brehu.',
    targetAmount: 18000, currentAmount: 18000,
  },
  {
    id: 'c3',
    title: 'Kolínské rozhledny',
    author: { name: 'Petr Novotný', avatar: 'https://i.pravatar.cc/150?img=15', verified: false },
    coverImage: 'https://images.unsplash.com/photo-1476231682828-37e571bc172f?w=800&h=600&fit=crop',
    createdAt: '2026-08-24T14:10:00Z',
    likes: 156, comments: 9, saved: false, liked: false, isNew: false,
    description: 'Tři rozhledny s výhledem na meandry Labe, vhodné i pro rodiny s dětmi. Zbierka pomáha s údržbou schodísk na všetkých troch vežiach.',
    targetAmount: 60000, currentAmount: 22400,
  },
  {
    id: 'c4',
    title: 'Lesní stezky u Vlašimi',
    author: { name: 'Jana Dvořáková', avatar: 'https://i.pravatar.cc/150?img=48', verified: false },
    coverImage: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=600&fit=crop',
    createdAt: '2026-08-20T07:45:00Z',
    likes: 67, comments: 2, saved: false, liked: false, isNew: false,
    description: 'Stinné lesní úseky perfektní na horké letní dny, s pramenem u poloviny trasy. Peniaze pôjdu na obnovu prístupu k prameňu.',
    targetAmount: 12000, currentAmount: 5100,
  },
];

const organizationPosts = [
  {
    id: 'o1',
    org: { name: 'Národní park České Švýcarsko', avatar: 'https://i.pravatar.cc/150?img=60', verified: true },
    image: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&h=600&fit=crop',
    createdAt: '2026-08-27T12:00:00Z',
    caption: 'Pravčická brána právě teď v ranní mlze. Otevřeno denně od 8:00. 🌤️',
    likes: 892,
    comments: [
      { id: 'cm1', user: 'hanka_v', text: 'Byla jsem tam minulý týden, nádhera!' },
      { id: 'cm2', user: 'martin.b', text: 'Kdy je nejlepší čas na fotky?' },
    ],
    sponsored: true,
  },
  {
    id: 'o2',
    org: { name: 'Krkonošský národní park', avatar: 'https://i.pravatar.cc/150?img=65', verified: true },
    image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop',
    createdAt: '2026-08-25T16:30:00Z',
    caption: 'Sněžka se probouzí do podzimu. Chodník na vrchol je aktuálně bez omezení.',
    likes: 431,
    comments: [{ id: 'cm3', user: 'outdoor_petr', text: 'Skvělá zpráva, jdeme tento víkend!' }],
    sponsored: false,
  },
  {
    id: 'o3',
    org: { name: 'CHKO Moravský kras', avatar: 'https://i.pravatar.cc/150?img=68', verified: false },
    image: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=800&h=600&fit=crop',
    createdAt: '2026-08-22T10:15:00Z',
    caption: 'Macocha z nové vyhlídkové plošiny — otevíráme tento pátek!',
    likes: 275,
    comments: [],
    sponsored: true,
  },
];

const sidebarLinks = {
  user: [
    { icon: 'home', label: 'Domů' },
    { icon: 'bookmark', label: 'Uložené zbierky' },
    { icon: 'trophy', label: 'Odznaky a výzvy' },
    { icon: 'wallet', label: 'Kredit a platby' },
    { icon: 'settings', label: 'Nastavenia' },
    { icon: 'help', label: 'Pomoc a podpora' },
  ],
  org: [
    { icon: 'home', label: 'Prehľad organizácie' },
    { icon: 'megaphone', label: 'Moje príspevky' },
    { icon: 'chart', label: 'Štatistiky dosahu' },
    { icon: 'wallet', label: 'Fakturácia' },
    { icon: 'settings', label: 'Nastavenia organizácie' },
  ],
};
