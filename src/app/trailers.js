import { PublicCatalogClient } from '../modules/catalog/application.ts';
import { startTrailerPlayer } from '../modules/catalog/trailer-player.js';
startTrailerPlayer(new PublicCatalogClient((url, init) => fetch(url, init)));
