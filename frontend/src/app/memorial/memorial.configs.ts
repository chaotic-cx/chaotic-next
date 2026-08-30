export interface MemorialConfig {
  year: number;
  description: string;
  keywords: string;
  subtitle?: string;
  subtitleHtml?: string;
  crossLink: string;
  crossLinkLabel: string;
  desktops: string[];
  terms: string[];
  specialDesktops: string[];
  specialTerms: string[];
}

export const MEMORIAL_2021: MemorialConfig = {
  year: 2021,
  description: 'Memorial of Chaotic-AUR, celebrating the third birthday of Chaotic-AUR',
  keywords:
    'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR memorial',
  subtitle: 'These screenshots have been collected by the community as celebration of the 3rd birthday of Chaotic-AUR.',
  crossLink: '/memorial-v2',
  crossLinkLabel: 'View Memorial — 2024 Edition',
  desktops: [
    'PROxZIMA.png',
    'alexjp.jpg',
    'aryan.png',
    'ash-2.png',
    'ash.png',
    'austin.png',
    'bernard-wayfire.png',
    'bernard.png',
    'dr460nf1r3.png',
    'ernesto.png',
    'fcinq.jpg',
    'filo.jpg',
    'fra.png',
    'iDigitalFlame.png',
    'icarns.png',
    'jeafran.png',
    'kevin.png',
    'kevin_nadar.png',
    'lesnake.jpg',
    'memorial.png',
    'odiousimp.png',
    'osvarcha.png',
    'pedrohlc.png',
    'redgloboli.png',
    'sgs_1.jpg',
    'sgs_2.jpg',
    'smoky.png',
    'sonya.png',
    'sugaya.png',
    'virusz4274.png',
    'vnepogodin.png',
    'zany130.png',
  ],
  terms: [
    'AvinashReddy3108.png',
    'ahmubashshir.png',
    'arch04.png',
    'b.jpg',
    'dr460nf1r3.png',
    'dr460nf1r3_vps.png',
    'fcinq.png',
    'freebird.png',
    'garuda_builder.png',
    'hisham.png',
    'jorge.png',
    'kenny.jpg',
    'librewish.png',
    'ninioArtillero.png',
    'pedrohlc.png',
    'rohit-arm.jpg',
    'sgs.png',
    'snowdan.jpg',
    'squirrellyDave.png',
    'swappy.png',
    'thotypous.jpg',
    'tne.png',
    'virusz4274.png',
    'vnepogodin.png',
    'x11guy.png',
    'zoe.png',
  ],
  specialDesktops: ['alexjp.jpg', 'fcinq.jpg', 'filo.jpg', 'virusz4274.png'],
  specialTerms: ['kenny.jpg', 'rohit-arm.jpg', 'snowdan.jpg'],
};

export const MEMORIAL_2024: MemorialConfig = {
  year: 2024,
  description: 'Memorial of Chaotic-AUR 2024, celebrating the sixth birthday of Chaotic-AUR',
  keywords:
    'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR memorial',
  subtitleHtml:
    'Celebrating the sixth birthday of Chaotic-AUR with community screenshot contributions ' +
    'and the launch of our <a class="text-ctp-peach hover:underline" href="https://gitlab.com/chaotic-aur/pkgbuilds" target="_blank" rel="noopener noreferrer">new build system infra 4.0 🎉</a>',
  crossLink: '/memorial',
  crossLinkLabel: 'View Memorial — 2021 Edition',
  desktops: [
    'AnkurAlpha.png',
    'FameWolf.jpg',
    'anispwyn.png',
    'dr460nf1r3.png',
    'elite.jpg',
    'icar.jpg',
    'victorsouzaleal.png',
    'yada.png',
    'zoeruda.jpg',
  ],
  terms: ['darian.png', 'dr460nf1r3.png', 'elite.jpg', 'immortalis.png', 'juest.jpg', 'yada.png'],
  specialDesktops: [],
  specialTerms: [],
};
