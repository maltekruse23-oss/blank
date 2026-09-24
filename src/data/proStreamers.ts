// Curated League of Legends players who stream on Twitch: pros and ex-pros, one-tricks and
// high-elo players. Real Twitch logins (not mock data); the Pros tab shows only those currently
// live in League of Legends. Compiled on 2026-09-22: a hand-picked part, plus players from the
// DPM.LOL SoloQ top 1000 (team or STREAMER tag) and OTP leaderboard with the Twitch channel
// linked on their DPM profile; champion names from Riot's Data Dragon. Checked against the
// Twitch API (see VALIDATION.md). The app does not read these sites; edit this list by hand.
//
// Lane and champions: DPM.LOL leaderboard (most played role, top three champions of the season);
// one-tricks keep only their champion. Hand-picked players: their known role and the champions of
// their DPM "last 2 weeks" (none when DPM had no recent games). A snapshot, not live data.

/** Twitch category id of League of Legends. */
export const LEAGUE_GAME_ID = '21779';

/** Data Dragon version of the champion icons (ddragon.leagueoflegends.com, allowed in the CSP). */
const DDRAGON_VERSION = '16.18.1';

export const LANES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'] as const;
export type Lane = (typeof LANES)[number];
export type ProKind = 'pro' | 'otp' | 'elo';

/** champs: Data Dragon champion ids, space-separated, most played first (one for one-tricks). */
type Entry = { login: string; label: string; lane: Lane; champs: string };
export type ProStreamer = Omit<Entry, 'champs'> & { kind: ProKind; champions: string[] };

const pros: Entry[] = [
  // Hand-picked: current and former professional players
  { login: 'caedrel', label: 'Ex-Pro', lane: 'Jungle', champs: 'Ezreal Yone Ahri' },
  { login: 'rekkles', label: 'Pro-Szene', lane: 'Support', champs: '' },
  { login: 'jankos', label: 'Ex-Pro', lane: 'Jungle', champs: 'Kayn LeeSin Ekko' },
  { login: 'broxah', label: 'Ex-Pro', lane: 'Jungle', champs: 'Teemo Shaco Rumble' },
  { login: 'odoamne', label: 'Pro-Szene', lane: 'Top', champs: '' },
  { login: 'perkzlol', label: 'Pro-Szene', lane: 'Mid', champs: 'Zed Caitlyn Ezreal' },
  { login: 'froggen', label: 'Ex-Pro', lane: 'Mid', champs: '' },
  { login: 'doublelift', label: 'Ex-Pro', lane: 'ADC', champs: 'Jinx Caitlyn Jhin' },
  { login: 'sneakylol', label: 'Ex-Pro', lane: 'ADC', champs: '' },
  { login: 'bjergsen', label: 'Ex-Pro', lane: 'Mid', champs: '' },
  { login: 'jensen', label: 'Ex-Pro', lane: 'Mid', champs: 'Hwei Ahri Anivia' },
  { login: 'pobelter', label: 'Ex-Pro', lane: 'Mid', champs: 'Kassadin Camille Tristana' },
  { login: 'dardoch', label: 'Ex-Pro', lane: 'Jungle', champs: 'LeeSin Ambessa Qiyana' },
  { login: 'meteos', label: 'Ex-Pro', lane: 'Jungle', champs: 'Belveth Skarner Qiyana' },
  { login: 'svenskeren', label: 'Ex-Pro', lane: 'Jungle', champs: '' },
  { login: 'imaqtpie', label: 'Ex-Pro', lane: 'ADC', champs: '' },
  { login: 'wildturtle', label: 'Ex-Pro', lane: 'ADC', champs: '' },
  { login: 'aphromoo', label: 'Ex-Pro', lane: 'Support', champs: '' },
  { login: 'shiphtur', label: 'Ex-Pro', lane: 'Mid', champs: 'Ekko Leblanc' },
  { login: 'voyboy', label: 'Ex-Pro', lane: 'Top', champs: '' },
  { login: 'lourlo', label: 'Ex-Pro', lane: 'Top', champs: '' },
  { login: 'hauntzer', label: 'Ex-Pro', lane: 'Top', champs: '' },
  { login: 'xpetu', label: 'Ex-Pro', lane: 'Jungle', champs: '' },
  // DPM.LOL: team tag on the SoloQ leaderboard
  { login: 'vladilol_', label: 'Pro · FNC', lane: 'Mid', champs: 'Ryze Jayce Cassiopeia' }, // Vladi
  { login: '1kaze', label: 'Pro · LLL', lane: 'Mid', champs: 'Syndra Sylas Cassiopeia' }, // Kaze
  { login: 'mrozku_', label: 'Pro · BOOM', lane: 'Mid', champs: 'Sylas Akali Jayce' }, // Mrozku
  { login: 'abbedagge', label: 'Pro · KHK', lane: 'Mid', champs: 'Ryze Aurora Ahri' }, // Abbedagge
  { login: 'unkn0wn_adc', label: 'Pro · VLR', lane: 'ADC', champs: 'Ezreal Caitlyn Yunara' }, // Unkn0wn
  { login: 'nafkelah', label: 'Pro · SC', lane: 'Mid', champs: 'Ryze Yone Galio' }, // Nafkelah
  { login: 'iwananlol', label: 'Pro · DV1', lane: 'Mid', champs: 'Ryze Aurora Jayce' }, // iwanan
  { login: 'hydramv', label: 'Pro · LUA', lane: 'Mid', champs: 'Akali Ahri Aurora' }, // Hydra
  { login: 'theocacs', label: 'Pro · ANB', lane: 'Jungle', champs: 'JarvanIV Vi XinZhao' }, // Theocacs
  {
    login: 'alwaysplanahealol',
    label: 'Pro · C9',
    lane: 'Mid',
    champs: 'Azir Cassiopeia Tristana',
  }, // APA
  { login: 'bwipolol', label: 'Pro · EST', lane: 'Top', champs: 'Aatrox Ambessa Jayce' }, // Bwipo
  { login: 'dekaplol', label: 'Pro · VITB', lane: 'Support', champs: 'Nautilus Bard Pyke' }, // Dekap
  { login: 'alixloll', label: 'Pro · GSMC', lane: 'Mid', champs: 'Yone Cassiopeia Zed' }, // alix
  { login: 'omongod', label: 'Pro · GL', lane: 'Mid', champs: 'Sylas Akali Yone' }, // OMON
  { login: 'markooneuw', label: 'Pro · G2N', lane: 'Jungle', champs: 'LeeSin Aatrox Ambessa' }, // Markoon
  { login: 'caliste_lol', label: 'Pro · KC', lane: 'ADC', champs: 'Ezreal Kaisa Yunara' }, // Caliste
  { login: 'zoelys_lol', label: 'Pro · GL', lane: 'Support', champs: 'Bard Nautilus Neeko' }, // Zoelys
  { login: 'stepz2', label: 'Pro · RED', lane: 'Jungle', champs: 'JarvanIV Jayce Aatrox' }, // STEPZ
  { login: 'zicssi', label: 'Pro · SLY', lane: 'Jungle', champs: 'Jayce Rakan LeeSin' }, // Zicssi
  { login: 'lol_adryuk', label: 'Pro · TOG', lane: 'ADC', champs: 'Yunara Zeri Jhin' }, // Ryuk
  { login: 'macaquino_lol', label: 'Pro · BAR', lane: 'Mid', champs: 'Lux Cassiopeia Aurora' }, // Macaquinho
  { login: 'getflakked', label: 'Pro · GX', lane: 'ADC', champs: 'Caitlyn Ezreal Senna' }, // Flakked
  { login: 'simplilol', label: 'Pro · AP', lane: 'Mid', champs: 'Sylas Yone Ryze' }, // Simpli
  { login: 'bbmuffinlol', label: 'Pro · BAN', lane: 'Mid', champs: 'Syndra Ahri Viktor' }, // bbmuffin
  { login: 'funk3ylol', label: 'Pro · EINS', lane: 'ADC', champs: 'Ezreal Kalista Jhin' }, // Fun K3y
  { login: 'sajator1', label: 'Pro · TOG', lane: 'Mid', champs: 'Yone Ahri Jayce' }, // SAJATOR
  { login: 'andariel1x', label: 'Pro · UCAM', lane: 'ADC', champs: 'Ezreal Kaisa Jhin' }, // Andariel
  { login: 'polskikoz', label: 'Pro · UCAM', lane: 'Top', champs: 'Ambessa Rumble Fiora' }, // Kozi
  { login: 'potent213', label: 'Pro · VITB', lane: 'Top', champs: 'Fiora Rumble Ambessa' }, // Potent
  { login: 'lyncaslol', label: 'Pro · VIT', lane: 'Jungle', champs: 'LeeSin Aatrox Vi' }, // Lyncas
  { login: 'theroyalkanin', label: 'Pro · USE', lane: 'Mid', champs: 'Cassiopeia Annie XinZhao' }, // RoyalKanin
  { login: 'gwen_nlol', label: 'Pro · KCBS', lane: 'ADC', champs: 'Zeri Senna Ezreal' }, // Gwen
  { login: 'slowwwq', label: 'Pro · SK', lane: 'Mid', champs: 'Sylas Akali Ryze' }, // SlowQ
  { login: 'grixfy', label: 'Pro · INTZ', lane: 'Support', champs: 'Camille Rell Pyke' }, // konseki
  { login: 'skeanz', label: 'Pro · SK', lane: 'Jungle', champs: 'LeeSin Vi Naafiri' }, // Skeanz
  { login: 'vetheo', label: 'Pro · SU', lane: 'Mid', champs: 'Syndra TwistedFate Ryze' }, // Vetheo
  { login: 'quidlolkr', label: 'Pro · TLAW', lane: 'Mid', champs: 'Azir LeeSin Cassiopeia' }, // Quid
  { login: 'kojimalol', label: 'Pro · KBM', lane: 'ADC', champs: 'Ezreal Varus Sivir' }, // Kojima
  { login: 'oleg_insec', label: 'Pro · KCBS', lane: 'Jungle', champs: 'Ambessa Qiyana LeeSin' }, // Oleg
  { login: 'rhilechlol', label: 'Pro · NAVI', lane: 'Jungle', champs: 'LeeSin JarvanIV Vi' }, // Rhilech
  { login: 'upsetger', label: 'Pro · FNC', lane: 'ADC', champs: 'Ezreal Caitlyn Yunara' }, // Upset
  { login: 'morttheus', label: 'Pro · RED', lane: 'ADC', champs: 'Ezreal Caitlyn Lucian' }, // Morttheus
  { login: 'zven_lol1', label: 'Pro · C9', lane: 'ADC', champs: 'Ezreal Corki Yunara' }, // Zven
  { login: 'relativelol', label: 'Pro · EWI', lane: 'Mid', champs: 'Orianna Cassiopeia Tristana' }, // Relative
  { login: 'busiolol', label: 'Pro · KC', lane: 'Support', champs: 'Pyke Camille Bard' }, // Busio
  { login: 'drakeherolol', label: 'Pro · NERD', lane: 'Jungle', champs: 'LeeSin JarvanIV Ambessa' }, // Drakehero
  { login: 'dajor25', label: 'Pro · IJC', lane: 'Mid', champs: 'Syndra Tristana Sylas' }, // Dajor
  { login: 'skewmond_lol', label: 'Pro · G2', lane: 'Jungle', champs: 'Vi JarvanIV LeeSin' }, // SkewMond
  { login: 'thaygerlol', label: 'Pro · GL', lane: 'Jungle', champs: 'Jayce Nocturne Qiyana' }, // Thayger
  { login: 'jeskla1', label: 'Pro · VKS', lane: 'ADC', champs: 'Syndra Viktor Jhin' }, // Jeskla
  { login: 'm1kyx', label: 'Pro · SK', lane: 'Support', champs: 'Bard Neeko Pyke' }, // Mikyx
  { login: 'jominseong13', label: 'Pro · SEN', lane: 'ADC', champs: 'Ezreal Yunara Lucian' }, // Rahel
  { login: 'denvoksne', label: 'Pro · USE', lane: 'ADC', champs: 'Yunara Lucian Zeri' }, // DenVoksne
  { login: 'rabelokoo', label: 'Pro · LLL', lane: 'ADC', champs: 'Ezreal Sivir Lucian' }, // Rabelo
  { login: 'mishigulol', label: 'Pro · VER', lane: 'ADC', champs: 'Yunara Corki Varus' }, // Mishi
  { login: 'zekaslol', label: 'Pro · VKS', lane: 'Top', champs: 'Rumble Ambessa Jayce' }, // zekas
  { login: 'hanssama', label: 'Pro · G2', lane: 'ADC', champs: 'Yunara Ezreal Varus' }, // Hans Sama
  { login: 'piloto_lol', label: 'Pro · NERD', lane: 'Mid', champs: 'Aurora Annie Leblanc' }, // Pilot
  { login: 'hazeltn', label: 'Pro · ROSS', lane: 'ADC', champs: 'Yunara Aphelios Jhin' }, // Hazel
  { login: 'venour', label: 'Pro · KHK', lane: 'Top', champs: 'Jayce Renekton Ambessa' }, // Venour
  { login: 'boda_lol_2', label: 'Pro · KHK', lane: 'Top', champs: 'Jayce Aurora Ambessa' }, // Boda
  { login: 'yakkeylol', label: 'Pro · VITB', lane: 'ADC', champs: 'Yunara Varus Zeri' }, // Yakkey
  { login: 'booki_lol', label: 'Pro · LEV', lane: 'Jungle', champs: 'Aatrox Ambessa LeeSin' }, // Booki
  { login: 'afriibi', label: 'Pro · RUD', lane: 'ADC', champs: 'Zeri Draven Ezreal' }, // Afriibi
  { login: 'ismaaalol', label: 'Pro · GX', lane: 'Jungle', champs: 'JarvanIV Nidalee Vi' }, // ISMA
  { login: 'avarice61', label: 'Pro · PCS', lane: 'ADC', champs: 'KogMaw Gragas Ezreal' }, // Avarice
  { login: 'fleshylol', label: 'Pro · VIT', lane: 'Support', champs: 'Bard Pyke Nautilus' }, // Fleshy
  { login: 'kamiloo_lol', label: 'Pro · KCB', lane: 'Mid', champs: 'Ryze Yasuo Azir' }, // Kamiloo
  { login: 'shycarrylol1', label: 'Pro · ANB', lane: 'ADC', champs: 'Ezreal Yunara Aphelios' }, // Shy Carry
  { login: 'qq_pawelek6', label: 'Pro · BCE', lane: 'Support', champs: 'Bard Neeko Nami' }, // Pawełek
  { login: 'esciklol', label: 'Pro · UCAM', lane: 'Mid', champs: 'Galio Orianna Ahri' }, // Escik
  { login: 'scamberr', label: 'Pro · VKS', lane: 'Support', champs: 'Bard Alistar Nautilus' }, // scamber
  { login: 'irrelevantrole', label: 'Pro · BIG', lane: 'Top', champs: 'Cassiopeia KSante Zaahen' }, // Irrelevant
  { login: 'manellol3', label: 'Pro · RED', lane: 'Support', champs: 'Bard Pyke Nautilus' }, // Manel
  { login: 'emilharbodk', label: 'Pro · OUAT', lane: 'Mid', champs: 'Zoe Syndra Ryze' }, // Harbo
  { login: 'seazlol', label: 'Pro · EINS', lane: 'Support', champs: 'Nautilus Pyke Bard' }, // seaz
  { login: 'supa_lol', label: 'Pro · MKOI', lane: 'ADC', champs: 'Ezreal Corki Kaisa' }, // Supa
  { login: 'serinlol12', label: 'Pro · TH', lane: 'Mid', champs: 'Akali Jayce Locke' }, // Serin
  { login: 'xynolol7', label: 'Pro · LLL', lane: 'Top', champs: 'Jayce Ambessa Gnar' }, // Xyno
  { login: 'tutszlol', label: 'Pro · FUR', lane: 'Mid', champs: 'Orianna Cassiopeia Anivia' }, // Tutsz
  { login: 'bulechalol', label: 'Pro · 7REX', lane: 'Support', champs: 'Bard Neeko Karma' }, // bulas
  { login: 'henalol99', label: 'Pro · PNG', lane: 'ADC', champs: 'Ezreal Caitlyn Lucian' }, // Hena
  { login: 'strode_lol', label: 'Pro · NBS', lane: 'ADC', champs: 'Yunara Hwei Syndra' }, // Strode
  { login: 'aggress1on_lol', label: 'Pro · TPX', lane: 'ADC', champs: 'Ashe Aphelios Ezreal' }, // Aggress1on
  { login: '13_lol1', label: 'Pro · MKF', lane: 'ADC', champs: 'Kaisa Aphelios Ezreal' }, // 13
  { login: 'yukinocat1', label: 'Pro · KCB', lane: 'Jungle', champs: 'Pantheon Qiyana LeeSin' }, // Yukino
  { login: 'wolorzlol', label: 'Pro · FEC', lane: 'Mid', champs: 'Ryze Ahri Akali' }, // Wolorz
  { login: 'j3kko1', label: 'Pro · ZENA', lane: 'Jungle', champs: 'Jayce LeeSin Graves' }, // Jekko
  { login: 'grevtharlol', label: 'Pro · KBM', lane: 'Mid', champs: 'Akali Cassiopeia Syndra' }, // Grevthar
  { login: 'disamislol', label: 'Pro · VKS', lane: 'Jungle', champs: 'LeeSin Qiyana RekSai' }, // Disamis
  { login: 'lol_maynter', label: 'Pro · NAVI', lane: 'Top', champs: 'Gnar Anivia Renekton' }, // Maynter
  { login: 'toastyalexlol', label: 'Pro · G2N', lane: 'Mid', champs: 'Yone Akali Sylas' }, // Toasty
  { login: 'xnslol', label: 'Pro · MKF', lane: 'Jungle', champs: 'JarvanIV Ambessa LeeSin' }, // XnS
  { login: 'nerothefik', label: 'Pro · RMD', lane: 'Jungle', champs: 'LeeSin Naafiri Qiyana' }, // Nero
  { login: 'lothen_', label: 'Pro · ANO', lane: 'ADC', champs: 'Ezreal Yunara Corki' }, // Lothen
  { login: 'myrtus_lol', label: 'Pro · MKF', lane: 'Support', champs: 'Camille Nautilus Pyke' }, // Myrtus
  { login: 'jezu_lol', label: 'Pro · ZYB', lane: 'ADC', champs: 'Kaisa Vayne Tristana' }, // Jezu
  { login: 'imfurby_lol', label: 'Pro · P11', lane: 'Mid', champs: 'Veigar Sylas Sion' }, // Furby
  { login: 'slayer_lol_', label: 'Pro · MKF', lane: 'Top', champs: 'Jayce Ambessa Rumble' }, // NightSlayer
  { login: '113bumm', label: 'Pro · BIG', lane: 'Jungle', champs: 'Qiyana Aatrox Viego' }, // 113
  { login: 'koldo_lol', label: 'Pro · BAR', lane: 'Jungle', champs: 'LeeSin Nidalee Naafiri' }, // Koldo
  { login: 'koussay3tn', label: 'Pro · BAM', lane: 'Mid', champs: 'Ahri Zoe Aurora' }, // Koussay
  { login: 'c0st0m', label: 'Pro · ROSS', lane: 'Mid', champs: 'Aurora Lissandra Akali' }, // c0st0m
  { login: 'evangeiyne', label: 'Pro · TP', lane: 'ADC', champs: 'Varus KogMaw Ezreal' }, // Evangelyne
  { login: 'soldierlol_', label: 'Pro · IJC', lane: 'ADC', champs: 'Caitlyn Yunara Kaisa' }, // Soldier
  { login: 'leny_lolgaming', label: 'Pro · FEC', lane: 'Top', champs: 'Anivia Aurora Rumble' }, // Leny
  { login: 'labrov55', label: 'Pro · G2', lane: 'Support', champs: 'Bard Neeko Nautilus' }, // Labrov
  { login: 'saverolol', label: 'Pro · NBS', lane: 'Jungle', champs: 'Sylas Ambessa Aatrox' }, // Savero
  { login: 'zyntslol', label: 'Pro · RED', lane: 'Top', champs: 'Ambessa Jayce Aurora' }, // zynts
  { login: 'odi11__', label: 'Pro · BOOM', lane: 'ADC', champs: 'Ezreal Corki Caitlyn' }, // Odi11
  { login: 'schow1', label: 'Pro · CR', lane: 'ADC', champs: 'Jhin Senna Ezreal' }, // Schow
  { login: 'harpoon_lol', label: 'Pro · GL', lane: 'ADC', champs: 'Kaisa Ezreal Caitlyn' }, // Harpoon
  { login: 'hakarilol', label: 'Pro · 7REX', lane: 'Top', champs: 'Jayce Rumble Ambessa' }, // Hakari
  { login: 'tyroneadc', label: 'Pro · HMB', lane: 'ADC', champs: 'Ezreal Yunara Aurora' }, // Tyrone
  { login: 'yupps', label: 'Pro · KBM', lane: 'Top', champs: 'Renekton Jayce Rumble' }, // Yupps
  { login: 'patrikadc', label: 'Pro · BIG', lane: 'ADC', champs: 'Yunara Ezreal Jhin' }, // Patrik
  { login: 'federic02k', label: 'Pro · MYTH', lane: 'ADC', champs: 'Jhin Ezreal Nautilus' }, // Fede
  { login: 'akanania', label: 'Pro · CLA', lane: 'ADC', champs: 'Kalista Yunara Caitlyn' }, // Akanania
  { login: 'lol_carnage', label: 'Pro · HMB', lane: 'Jungle', champs: 'LeeSin Nocturne JarvanIV' }, // Carnage
  { login: 'kprlol', label: 'Pro · VLR', lane: 'Top', champs: 'Jayce KSante Renekton' }, // kPr
  { login: 'sw3ry__', label: 'Pro · CLA', lane: 'Support', champs: 'Karma Lulu Nami' }, // Sw3ry
  { login: 'xkenzuke', label: 'Pro · ES', lane: 'Mid', champs: 'Yasuo Akali Gragas' }, // xKenzuke
  { login: 'shourdylol', label: 'Pro · SNSH', lane: 'Top', champs: 'KSante Zaahen XinZhao' }, // Shourdy
  { login: 'kaboomxxd', label: 'Pro · SU', lane: 'Jungle', champs: 'Ambessa JarvanIV LeeSin' }, // Kaboom
  { login: 'caps', label: 'Pro · G2', lane: 'Mid', champs: 'Aurora Ahri Orianna' }, // Caps
  { login: 'momochilol1', label: 'Pro · FX', lane: 'Support', champs: 'Pyke Alistar Bard' }, // Momochi
  { login: 'fresskowy', label: 'Pro · MKF', lane: 'Mid', champs: 'Akali Ryze Ahri' }, // Fresskowy
  { login: 'saken_lol', label: 'Pro · ZYB', lane: 'Mid', champs: 'Ryze Anivia Ahri' }, // Saken
  { login: 'scuffedlss', label: 'Pro · DEER', lane: 'Mid', champs: 'Draven Syndra Ahri' }, // Scuffed
  { login: 'ricadam_lol', label: 'Pro · ZYB', lane: 'Top', champs: 'Jayce Aurora Ambessa' }, // Adam
  { login: 'papiteero', label: 'Pro · HRTS', lane: 'Top', champs: 'Jayce Gnar Vayne' }, // Papiteero
  { login: 'thebeautifuldino', label: 'Pro · CR', lane: 'Jungle', champs: 'RekSai Vi Jayce' }, // Dino
  { login: 'mercy9_lol', label: 'Pro · HRTS', lane: 'Mid', champs: 'Akali Sylas Irelia' }, // Mercy9
  { login: 'tebox_7', label: 'Pro · THG', lane: 'ADC', champs: 'Ezreal Jhin Varus' }, // Tebox
  { login: 'fantomisto', label: 'Pro · ES', lane: 'Mid', champs: 'Cassiopeia Taliyah Aurora' }, // fantomisto
  { login: 'kozak_lul', label: 'Pro · SPK', lane: 'ADC', champs: 'Ezreal Tristana Syndra' }, // Kozak
  { login: 'sayn_loll', label: 'Pro · VER', lane: 'Mid', champs: 'Aurora Akali Yone' }, // Sayn
  { login: 'richuke', label: 'Pro · SGE', lane: 'Support', champs: 'Rell Alistar Bard' }, // Richu
  { login: 'carzzy', label: 'Pro · VIT', lane: 'ADC', champs: 'Ezreal Bard Senna' }, // Carzzy
  { login: 'diegobrance', label: 'Pro · EST', lane: 'ADC', champs: 'Ezreal Sivir Kaisa' }, // Brance
  { login: 'srtty_lol', label: 'Pro · DSG', lane: 'Top', champs: 'Jayce Rumble Ambessa' }, // Srtty
  { login: 'envyl0l', label: 'Pro · EST', lane: 'Mid', champs: 'Sylas Locke Aurora' }, // Envy
  { login: 'uzent', label: 'Pro · LLL', lane: 'Support', champs: 'Bard Camille Rakan' }, // uZent
  { login: 'mireu324', label: 'Pro · VKS', lane: 'Mid', champs: 'Akali Locke Galio' }, // Mireu
  { login: 'josedeodo', label: 'Pro · TLAW', lane: 'Jungle', champs: 'LeeSin Jayce Aatrox' }, // Josedeodo
  { login: 'fudgeylol', label: 'Pro · SR', lane: 'Top', champs: 'Jayce Varus Ambessa' }, // Fudge
  { login: 'ayulol1', label: 'Pro · FUR', lane: 'ADC', champs: 'Ezreal Jhin KSante' }, // Ayu
  { login: 'telaslol', label: 'Pro · EST', lane: 'Support', champs: 'Nami Bard Karma' }, // Telas
  { login: 'frogenyalios', label: 'Pro · MVE', lane: 'ADC', champs: 'Lucian Ezreal Aphelios' }, // nika
  { login: 'celolol1', label: 'Pro · RMD', lane: 'ADC', champs: 'Ezreal Kaisa Caitlyn' }, // Celo
  { login: 'sunfry_lol', label: 'Pro · PCS', lane: 'Support', champs: 'Bard Elise Alistar' }, // Sunfry
  { login: 'duduhhlol1', label: 'Pro · LOS', lane: 'ADC', champs: 'Ezreal Jayce Vayne' }, // Duduhh
  { login: 'kogudo', label: 'Pro · NERD', lane: 'ADC', champs: 'Rengar Quinn Aphelios' }, // Kog
  { login: 'darkwingslol', label: 'Pro · SEN', lane: 'Mid', champs: 'Cassiopeia Lissandra Ryze' }, // DARKWINGS
  { login: 'itsnetuno', label: 'Pro · INTZ', lane: 'ADC', champs: 'Kaisa Ezreal Corki' }, // Netuno
  { login: 'elkinhoo', label: 'Pro · NERD', lane: 'Support', champs: 'Alistar Nautilus Bard' }, // Elkinho
  { login: 'carioklol', label: 'Pro · PNG', lane: 'Jungle', champs: 'LeeSin Naafiri Qiyana' }, // CarioK
  { login: 'makeslol_', label: 'Pro · NERD', lane: 'Top', champs: 'Zaahen KSante Gangplank' }, // Makes
];

const oneTricks: Entry[] = [
  // Hand-picked
  { login: 'yassuo', label: 'OTP Yasuo', lane: 'Mid', champs: 'Yasuo' },
  { login: 'trick2g', label: 'OTP Udyr', lane: 'Jungle', champs: 'Udyr' },
  { login: 'boxbox', label: 'OTP Riven', lane: 'Top', champs: 'Riven' },
  { login: 'ratirl', label: 'OTP Twitch', lane: 'ADC', champs: 'Twitch' },
  // DPM.LOL: OTP leaderboard
  { login: 'phantasm__', label: 'OTP Akshan', lane: 'Mid', champs: 'Akshan' }, // Phantasm
  { login: 'spear_shot', label: 'OTP Pantheon', lane: 'Top', champs: 'Pantheon' }, // Spear_Shot
  { login: 'viper', label: 'OTP Riven', lane: 'Mid', champs: 'Riven' }, // Viper.
  { login: 'cruncywm', label: 'OTP Sylas', lane: 'Mid', champs: 'Sylas' }, // CruncyWM
  { login: 'kaos_angel', label: 'OTP Talon', lane: 'Jungle', champs: 'Talon' }, // Kaos_Angel
  { login: 'tommyg33', label: 'OTP Bard', lane: 'Support', champs: 'Bard' }, // Tommy
  { login: 'mirrai_lol', label: 'OTP Kalista', lane: 'ADC', champs: 'Kalista' }, // Mirrai
  { login: 'bz_euw', label: 'OTP Zed', lane: 'Mid', champs: 'Zed' }, // BZ
  { login: 'poes_tk', label: 'OTP Riven', lane: 'Top', champs: 'Riven' }, // PoEs_Tk
  { login: 'sinerias', label: 'OTP Master Yi', lane: 'Jungle', champs: 'MasterYi' }, // Sinerias
  { login: 'dragdar', label: 'OTP Ezreal', lane: 'ADC', champs: 'Ezreal' }, // Dragdar
  { login: 'bioticzilean', label: 'OTP Zilean', lane: 'Support', champs: 'Zilean' }, // Biotic
  { login: 'naayil', label: 'OTP Aatrox', lane: 'Jungle', champs: 'Aatrox' }, // Naayil
  { login: 'dunlol', label: 'OTP Viktor', lane: 'Mid', champs: 'Viktor' }, // Dun
  { login: 'dawidssonek', label: 'OTP Kog’Maw', lane: 'Mid', champs: 'KogMaw' }, // DawidSSonek
  { login: 'builteuw', label: 'OTP Riven', lane: 'Mid', champs: 'Riven' }, // Built
  { login: 'peng04', label: 'OTP Ahri', lane: 'Mid', champs: 'Ahri' }, // Peng
  { login: 'peoploll', label: 'OTP Akshan', lane: 'Mid', champs: 'Akshan' }, // Peop
  { login: 'brohan', label: 'OTP Yasuo', lane: 'Mid', champs: 'Yasuo' }, // BROHAN
  { login: 'opossos', label: 'OTP Zilean', lane: 'Mid', champs: 'Zilean' }, // Opossos
  { login: 'metroarcher112', label: 'OTP Caitlyn', lane: 'ADC', champs: 'Caitlyn' }, // MetroArcher
  { login: 'lol_doki', label: 'OTP Kog’Maw', lane: 'ADC', champs: 'KogMaw' }, // Doki
];

const highElo: Entry[] = [
  // Hand-picked
  { login: 'lsxyz', label: 'Analyst', lane: 'Mid', champs: '' },
  { login: 'loltyler1', label: 'High Elo', lane: 'ADC', champs: 'Draven Brand Illaoi' },
  { login: 'thebausffs', label: 'High Elo', lane: 'Top', champs: 'Irelia Sion Gragas' },
  { login: 'agurin', label: 'High Elo', lane: 'Jungle', champs: 'Elise Khazix JarvanIV' },
  { login: 'tarzaned', label: 'High Elo', lane: 'Jungle', champs: '' },
  { login: 'drututt', label: 'High Elo', lane: 'ADC', champs: 'Yone Zaahen Fiora' },
  { login: 'solarbacca', label: 'High Elo', lane: 'ADC', champs: 'Gangplank Nautilus' },
  { login: 'tfblade', label: 'High Elo', lane: 'Top', champs: '' },
  { login: 'nightblue3', label: 'High Elo', lane: 'Jungle', champs: '' },
  { login: 'noway4u_sir', label: 'High Elo', lane: 'Top', champs: 'Gangplank Gragas Anivia' },
  { login: 'sanchovies', label: 'High Elo', lane: 'Mid', champs: 'Camille Garen Hwei' },
  // DPM.LOL: STREAMER tag, SoloQ top 1000
  { login: 'nattynattlol', label: 'High Elo', lane: 'Jungle', champs: 'Rengar Sylas DrMundo' }, // NattyNatt
  { login: 'crawl2r', label: 'High Elo', lane: 'Mid', champs: 'Zed Ekko Locke' }, // crawl2r
  { login: 'ariziinho', label: 'High Elo', lane: 'Mid', champs: 'Hwei Zoe Veigar' }, // Ariziinho
  { login: 'raidergo', label: 'High Elo', lane: 'Top', champs: 'Darius Kayle Veigar' }, // RaiderGO
  { login: 'bibou_lol', label: 'High Elo', lane: 'ADC', champs: 'Ezreal Kaisa Varus' }, // Bibou
  { login: 'kaiitania', label: 'High Elo', lane: 'Mid', champs: 'Qiyana Sylas Talon' }, // kaitania
  { login: 'veradux___', label: 'High Elo', lane: 'Top', champs: 'Shen Karma KSante' }, // Veradux
  { login: 'brunox1001', label: 'High Elo', lane: 'Mid', champs: 'Zac Hwei Ornn' }, // Brunox1001
  { login: 'strompest', label: 'High Elo', lane: 'Mid', champs: 'Ryze Syndra Cassiopeia' }, // Strompest
  { login: 'ttobias_lol', label: 'High Elo', lane: 'Mid', champs: 'Zed Yasuo Yone' }, // TTobias
  { login: 'gonzo22_', label: 'High Elo', lane: 'Mid', champs: 'Quinn Nautilus Karma' }, // Gonzo
  {
    login: 'turosteszta_lol',
    label: 'High Elo',
    lane: 'Jungle',
    champs: 'Shaco Nocturne Volibear',
  }, // Turosteszta
  { login: 'quante', label: 'High Elo', lane: 'Top', champs: 'Urgot Garen Singed' }, // Quante
  { login: 'sakuritou', label: 'High Elo', lane: 'Mid', champs: 'Chogath Velkoz Sion' }, // Sakuritou
  { login: 'codysun', label: 'High Elo', lane: 'ADC', champs: 'Tristana Ezreal Yunara' }, // CodySun
  { login: 'samikinlol', label: 'High Elo', lane: 'Mid', champs: 'Zoe Aurora Mel' }, // Samikin
  { login: 'cloud_v2_', label: 'High Elo', lane: 'Mid', champs: 'Kassadin Vladimir Udyr' }, // Cloud_V2_
  { login: 'wawek777', label: 'High Elo', lane: 'Mid', champs: 'Vladimir AurelionSol Akshan' }, // Wawek777
  { login: 'arthurlanches', label: 'High Elo', lane: 'Top', champs: 'Teemo Ornn Varus' }, // Arthur Lanches
  { login: 'tempest', label: 'High Elo', lane: 'Mid', champs: 'Yone Yasuo Anivia' }, // Tempest
  { login: 'kurfyou', label: 'High Elo', lane: 'ADC', champs: 'Zilean Elise Jinx' }, // Kurfyou
  { login: 'dusk__lol', label: 'High Elo', lane: 'Jungle', champs: 'Qiyana Khazix JarvanIV' }, // dusk__lol
  { login: 'petricitelol', label: 'High Elo', lane: 'Mid', champs: 'Sylas Viego Galio' }, // Petricite
  { login: 'guilty', label: 'High Elo', lane: 'Jungle', champs: 'Talon Brand Kayn' }, // Guilty
];

const withKind =
  (kind: ProKind) =>
  ({ champs, ...p }: Entry): ProStreamer => ({
    ...p,
    kind,
    champions: champs.split(' ').filter(Boolean),
  });

export const proStreamers: ProStreamer[] = [
  ...pros.map(withKind('pro')),
  ...oneTricks.map(withKind('otp')),
  ...highElo.map(withKind('elo')),
];

/** Display names of the champion ids above that differ from the id. */
const championNames: Record<string, string> = {
  AurelionSol: 'Aurelion Sol',
  Belveth: 'Bel’Veth',
  Chogath: 'Cho’Gath',
  DrMundo: 'Dr. Mundo',
  JarvanIV: 'Jarvan IV',
  KSante: 'K’Sante',
  Kaisa: 'Kai’Sa',
  Khazix: 'Kha’Zix',
  KogMaw: 'Kog’Maw',
  Leblanc: 'LeBlanc',
  LeeSin: 'Lee Sin',
  MasterYi: 'Master Yi',
  RekSai: 'Rek’Sai',
  TwistedFate: 'Twisted Fate',
  Velkoz: 'Vel’Koz',
  XinZhao: 'Xin Zhao',
};

export function championName(id: string) {
  return championNames[id] ?? id;
}

export function championIcon(id: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${id}.png`;
}
