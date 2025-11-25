import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ALIASES_FILE = path.join(process.cwd(), 'lib', 'data', 'team-aliases.json');

/**
 * GET - Retrieve all team aliases
 */
export async function GET() {
  try {
    if (!fs.existsSync(ALIASES_FILE)) {
      return NextResponse.json({ aliases: {} });
    }

    const data = fs.readFileSync(ALIASES_FILE, 'utf-8');
    const aliases = JSON.parse(data);
    delete aliases._comment;

    return NextResponse.json({ aliases });
  } catch (error) {
    console.error('Failed to read team aliases:', error);
    return NextResponse.json(
      { error: 'Failed to read team aliases' },
      { status: 500 }
    );
  }
}

/**
 * POST - Add a new team alias
 * Body: { from: string, to: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { from, to } = body;

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Both "from" and "to" are required' },
        { status: 400 }
      );
    }

    // Normalize the "from" key (lowercase, dashes for spaces)
    const normalizedFrom = from.toLowerCase().replace(/\s+/g, '-');

    // Load existing aliases
    let aliases: Record<string, string> = { _comment: 'Maps team name variations to canonical team IDs' };

    if (fs.existsSync(ALIASES_FILE)) {
      const data = fs.readFileSync(ALIASES_FILE, 'utf-8');
      aliases = JSON.parse(data);
    }

    // Add new alias
    aliases[normalizedFrom] = to;

    // Ensure directory exists
    const dir = path.dirname(ALIASES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save updated aliases
    fs.writeFileSync(ALIASES_FILE, JSON.stringify(aliases, null, 2), 'utf-8');

    console.log(`Added team alias: ${normalizedFrom} → ${to}`);

    return NextResponse.json({
      success: true,
      alias: { from: normalizedFrom, to },
    });
  } catch (error) {
    console.error('Failed to save team alias:', error);
    return NextResponse.json(
      { error: 'Failed to save team alias' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove a team alias
 * Body: { from: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { from } = body;

    if (!from) {
      return NextResponse.json(
        { error: '"from" is required' },
        { status: 400 }
      );
    }

    const normalizedFrom = from.toLowerCase().replace(/\s+/g, '-');

    if (!fs.existsSync(ALIASES_FILE)) {
      return NextResponse.json(
        { error: 'Alias not found' },
        { status: 404 }
      );
    }

    const data = fs.readFileSync(ALIASES_FILE, 'utf-8');
    const aliases = JSON.parse(data);

    if (!(normalizedFrom in aliases)) {
      return NextResponse.json(
        { error: 'Alias not found' },
        { status: 404 }
      );
    }

    delete aliases[normalizedFrom];

    fs.writeFileSync(ALIASES_FILE, JSON.stringify(aliases, null, 2), 'utf-8');

    console.log(`Removed team alias: ${normalizedFrom}`);

    return NextResponse.json({
      success: true,
      removed: normalizedFrom,
    });
  } catch (error) {
    console.error('Failed to delete team alias:', error);
    return NextResponse.json(
      { error: 'Failed to delete team alias' },
      { status: 500 }
    );
  }
}
