import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, MessageFlags, REST, Routes, ActivityType } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Replace your config require
import config from './config.js'; 
const { token, TERMS_VERSION } = config;

// Replace your other local requires
import db from './database.js';
import { checkBlacklist, buildBlacklistEmbed } from './blacklist.js';
import setupLogger from './logger.js';
import { createTicket } from './commands/ticket.js';
import { initGiveawayEngine } from './engines/giveawayManager.js';
