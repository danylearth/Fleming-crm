// Curated Unsplash photos of UK residential properties
const UK_HOUSE_PHOTOS = [
  '1558036117-15d97c2cc1f7', // terraced houses
  '1570129477492-45c003edd2be', // brick semi-detached
  '1576941089067-2de3c901e126', // modern house
  '1583608205776-bfd35f0d9f83', // victorian terrace
  '1598228723793-2a585e0b1b74', // row of houses
  '1582268611958-ebfd161ef9cf', // residential street
  '1595877244574-324c44e8c22e', // cottage style
  '1591474200742-8e512e6f98f8', // red brick house
  '1568605114967-8130f3a36994', // suburban home
  '1600596542815-ffad4c1539a8', // townhouse
  '1572120360610-d971b9d7767c', // detached house
  '1560448204-e02f11c3d0e2', // classic british home
];

export function getPropertyImage(id: number, width = 400, height = 240): string {
  const photo = UK_HOUSE_PHOTOS[id % UK_HOUSE_PHOTOS.length];
  return `https://images.unsplash.com/photo-${photo}?w=${width}&h=${height}&fit=crop&auto=format&q=80`;
}
