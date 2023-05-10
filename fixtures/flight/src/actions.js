'use server';

import { db } from './database.js';
import { getRandomColor } from './utils.js';

export async function addComment(formData) {
  await db.insertComment({
    color: getRandomColor(),
    text: formData.get('text'),
    postId: formData.get('slug')
  });
}

export async function updateTheme(gradient) {
  await db.saveTheme(gradient);
}
