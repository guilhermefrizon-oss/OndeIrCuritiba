export type Place = {
  id: string;
  name: string;
  category: string;
  price: string;
  neighborhood: string;
  hours: string;
  instagram: string;
  emoji: string;
  gradientKey: string;
};

export const CATEGORIES = [
  { label: 'Todos', emoji: '🗺️' },
  { label: 'Café da tarde', emoji: '☕' },
  { label: 'Barzinho', emoji: '🍸' },
  { label: 'Céu aberto', emoji: '🌆' },
  { label: 'Balada', emoji: '🎵' },
  { label: 'Romântico', emoji: '🕯️' },
  { label: 'Baratinho', emoji: '🍔' },
  { label: 'Alta gastronomia', emoji: '⭐' },
  { label: 'Vegano', emoji: '🌱' },
  { label: 'Pet friendly', emoji: '🐾' },
  { label: 'Instagramável', emoji: '📸' },
];

export const PLACES: Place[] = [
  { id: '1',  name: 'Terrazza 40',          category: 'Céu aberto',       price: '$$$$',  neighborhood: 'Bigorrilho',       hours: '12h–23h', instagram: '@terrazza40',          emoji: '🌆', gradientKey: 'rooftop' },
  { id: '2',  name: 'Gards Rooftop',        category: 'Céu aberto',       price: '$$$',   neighborhood: 'Batel',            hours: '17h–01h', instagram: '@gardsrooftop',        emoji: '🌇', gradientKey: 'rooftop' },
  { id: '3',  name: 'Souq Curitiba',        category: 'Céu aberto',       price: '$$',    neighborhood: 'Vila Izabel',      hours: '17h–23h', instagram: '@souqcuritiba',        emoji: '🏙️', gradientKey: 'rooftop' },
  { id: '4',  name: 'Lucca Cafés',          category: 'Café da tarde',    price: '$$',    neighborhood: 'Batel',            hours: '08h–20h', instagram: '@luccacafesespeciais', emoji: '☕', gradientKey: 'cafe' },
  { id: '5',  name: 'Prestinaria',          category: 'Café da tarde',    price: '$$',    neighborhood: 'Bigorrilho',       hours: '07h–20h', instagram: '@prestinaria',         emoji: '🥐', gradientKey: 'cafe' },
  { id: '6',  name: 'Café do Viajante',     category: 'Café da tarde',    price: '$$',    neighborhood: 'Centro Cívico',    hours: '12h–19h', instagram: '@cafedoviajante',      emoji: '✈️', gradientKey: 'cafe' },
  { id: '7',  name: 'Ponto Gin',            category: 'Barzinho',         price: '$$',    neighborhood: 'Mercês',           hours: '18h–00h', instagram: '@pontogin',            emoji: '🍸', gradientKey: 'bar' },
  { id: '8',  name: 'Sirène Fish & Chips',  category: 'Barzinho',         price: '$',     neighborhood: 'Centro',           hours: '18h–23h', instagram: '@sirenebrazil',        emoji: '🐟', gradientKey: 'bar' },
  { id: '9',  name: 'A Ostra Bêbada',       category: 'Barzinho',         price: '$$',    neighborhood: 'Centro',           hours: '11h–23h', instagram: '@aostrabebada',        emoji: '🦪', gradientKey: 'bar' },
  { id: '10', name: 'Sheridans Irish Pub',  category: 'Balada',           price: '$$',    neighborhood: 'Batel',            hours: '18h–02h', instagram: '@sheridansirishpub',   emoji: '🎸', gradientKey: 'balada' },
  { id: '11', name: 'Crossroads',           category: 'Balada',           price: '$$',    neighborhood: 'Água Verde',       hours: '20h–04h', instagram: '@barcrossroads',       emoji: '🎵', gradientKey: 'balada' },
  { id: '12', name: 'Paradis Club',         category: 'Balada',           price: '$$',    neighborhood: 'São Francisco',    hours: '22h–05h', instagram: '@paradisclub',         emoji: '🎉', gradientKey: 'balada' },
  { id: '13', name: "L'Epicerie",           category: 'Romântico',        price: '$$$$',  neighborhood: 'Bigorrilho',       hours: '19h–23h', instagram: '@lepiceriecuritiba',   emoji: '🕯️', gradientKey: 'romantico' },
  { id: '14', name: 'Ile de France',        category: 'Romântico',        price: '$$$$',  neighborhood: 'Batel',            hours: '19h–23h', instagram: '@iledefrancecuritiba', emoji: '🥂', gradientKey: 'romantico' },
  { id: '15', name: 'Poco Tapas',           category: 'Romântico',        price: '$$$',   neighborhood: 'Batel',            hours: '19h–23h', instagram: '@pocotapas',           emoji: '🍷', gradientKey: 'romantico' },
  { id: '16', name: 'Bife Sujo',            category: 'Baratinho',        price: '$',     neighborhood: 'Centro',           hours: '11h–23h', instagram: '@bifesujocuritiba',    emoji: '🍔', gradientKey: 'barato' },
  { id: '17', name: 'Bar Palácio',          category: 'Baratinho',        price: '$$',    neighborhood: 'Centro',           hours: '19h–01h', instagram: '@barpalacio',          emoji: '🍺', gradientKey: 'barato' },
  { id: '18', name: 'Pastelaria Juvevê',    category: 'Baratinho',        price: '$',     neighborhood: 'Juvevê',           hours: '09h–21h', instagram: '@pastelariajuveve',    emoji: '🥟', gradientKey: 'barato' },
  { id: '19', name: 'Durski',               category: 'Alta gastronomia', price: '$$$$$', neighborhood: 'Centro Histórico', hours: '19h–23h', instagram: '@restaurantedurski',   emoji: '👨‍🍳', gradientKey: 'alta' },
  { id: '20', name: 'Manu',                 category: 'Alta gastronomia', price: '$$$$$', neighborhood: 'Batel',            hours: '19h–23h', instagram: '@restaurantemanu',     emoji: '⭐', gradientKey: 'alta' },
  { id: '21', name: 'Obst.',                category: 'Alta gastronomia', price: '$$$$',  neighborhood: 'Centro',           hours: '19h–23h', instagram: '@obst.lugar',          emoji: '🍽️', gradientKey: 'alta' },
  { id: '22', name: 'Veg Veg',              category: 'Vegano',           price: '$$',    neighborhood: 'Centro',           hours: '11h–20h', instagram: '@vegvegcuritiba',      emoji: '🥗', gradientKey: 'vegano' },
  { id: '23', name: 'Bouquet Garni',        category: 'Vegano',           price: '$$',    neighborhood: 'Centro Cívico',    hours: '11h–15h', instagram: '@bouquetgarnicuritiba',emoji: '🌿', gradientKey: 'vegano' },
  { id: '24', name: 'Verd&Co',             category: 'Vegano',           price: '$$',    neighborhood: 'Batel',            hours: '11h–22h', instagram: '@verd.co',             emoji: '🌱', gradientKey: 'vegano' },
  { id: '25', name: 'Degusto Café',         category: 'Pet friendly',     price: '$$',    neighborhood: 'Batel',            hours: '09h–20h', instagram: '@degustocafe',         emoji: '🐾', gradientKey: 'pet' },
  { id: '26', name: 'Garden Hamburgueria',  category: 'Pet friendly',     price: '$$',    neighborhood: 'São Francisco',    hours: '17h–00h', instagram: '@gardencwb',           emoji: '🐶', gradientKey: 'pet' },
  { id: '27', name: 'SFCO 179',            category: 'Pet friendly',     price: '$$',    neighborhood: 'Centro',           hours: '10h–23h', instagram: '@sfco179',             emoji: '🏡', gradientKey: 'pet' },
  { id: '28', name: 'Botanique',            category: 'Instagramável',    price: '$$',    neighborhood: 'Centro',           hours: '10h–23h', instagram: '@botaniquecafebar',    emoji: '🌺', gradientKey: 'insta' },
  { id: '29', name: 'Cosmos Gastrobar',     category: 'Instagramável',    price: '$$',    neighborhood: 'Batel',            hours: '18h–00h', instagram: '@cosmosgastrobar',     emoji: '✨', gradientKey: 'insta' },
  { id: '30', name: 'Officina Restô Bar',   category: 'Instagramável',    price: '$$$',   neighborhood: 'Centro',           hours: '18h–00h', instagram: '@officinarestobar',    emoji: '📸', gradientKey: 'insta' },
];
