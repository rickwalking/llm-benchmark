import { After, Before } from '@cucumber/cucumber';
import { LibraryWorld } from './world.js';

Before(async function (this: LibraryWorld) {
  await this.start();
});

After(async function (this: LibraryWorld) {
  await this.stop();
});
