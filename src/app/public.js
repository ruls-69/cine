import { PublicCatalogClient } from '../modules/catalog/application.ts';
import { startPublicCatalog } from '../modules/catalog/public-presentation.js';
import { startCinemaMotion } from '../modules/catalog/motion.js';
startPublicCatalog(new PublicCatalogClient((url, init) => fetch(url, init)));

startCinemaMotion();
