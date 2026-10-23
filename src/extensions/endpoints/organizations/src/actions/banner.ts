import { Readable } from 'node:stream';
import { createError } from '@directus/errors';
import type { EndpointExtensionContext } from '@directus/extensions';
import type { TransformationParams } from '@directus/types';
import type { Request } from 'express';
import { BANNERS_FOLDER_ID } from '../../../../lib/src/constants.js';

const MAX_BYTES = 5 * 1024 * 1024;
const MIN_WIDTH = 1224;
const MIN_HEIGHT = 200;

// The file signature of each accepted format.
const FORMATS = [
	{ format: 'png', matches: (image: Buffer) => image.subarray(0, 8).equals(Buffer.from([ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a ])) },
	{ format: 'jpeg', matches: (image: Buffer) => image.subarray(0, 3).equals(Buffer.from([ 0xff, 0xd8, 0xff ])) },
	{ format: 'webp', matches: (image: Buffer) => image.toString('latin1', 0, 4) === 'RIFF' && image.toString('latin1', 8, 12) === 'WEBP' },
];

const NotFoundError = createError('NOT_FOUND', 'Organization not found.', 404);
const TooLargeFileError = createError('CONTENT_TOO_LARGE', 'The banner must be 5 MB or smaller.', 413);
const InvalidFormatError = createError('INVALID_PAYLOAD_ERROR', 'The banner must be a PNG, JPEG or WebP image.', 400);
const TooSmallError = createError('INVALID_PAYLOAD_ERROR', `The banner must be at least ${MIN_WIDTH}×${MIN_HEIGHT} px.`, 400);
const TooBigError = createError<{ maxSide: number }>('INVALID_PAYLOAD_ERROR', ({ maxSide }) => `The banner must be at most ${maxSide}×${maxSide} px.`, 400);

export const readBody = (req: Request): Promise<Buffer> => new Promise((resolve, reject) => {
	if (!req.is('image/*')) {
		req.resume();
		reject(new InvalidFormatError());
		return;
	}

	const chunks: Buffer[] = [];
	let size = 0;

	const onData = (chunk: Buffer) => {
		size += chunk.length;

		if (size > MAX_BYTES) {
			req.off('data', onData);
			req.resume();
			reject(new TooLargeFileError());
			return;
		}

		chunks.push(chunk);
	};

	req.on('data', onData);
	req.on('end', () => resolve(Buffer.concat(chunks)));
	req.on('error', reject);
});

const getFilesService = async ({ services, getSchema }: EndpointExtensionContext) => {
	return new services.FilesService({ schema: await getSchema() });
};

const deleteFile = async (fileId: string, context: EndpointExtensionContext) => {
	await (await getFilesService(context)).deleteOne(fileId);
};

// Swaps the org banner under a row lock and returns the old one, so parallel uploads never lose or double-delete a file.
const setBanner = (orgId: string, bannerId: string | null, { database }: EndpointExtensionContext) => database.transaction(async (trx) => {
	const org = await trx('gp_orgs').where({ id: orgId }).forUpdate().first<{ banner: string | null } | undefined>('banner');

	if (!org) {
		throw new NotFoundError();
	}

	await trx('gp_orgs').where({ id: orgId }).update({ banner: bannerId });
	return org.banner;
});

// Directus leaves the size empty if the header is unreadable or the image is too big, and resizes no side above the max.
const checkSize = async (bannerId: string, { database, env }: EndpointExtensionContext) => {
	const { width, height } = await database('directus_files').where({ id: bannerId }).first<{ width: number | null; height: number | null }>('width', 'height');
	const maxSide = Number(env.ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION);

	if (!width || !height) {
		throw new InvalidFormatError();
	}

	if (width > maxSide || height > maxSide) {
		throw new TooBigError({ maxSide });
	}

	if (width < MIN_WIDTH || height < MIN_HEIGHT) {
		throw new TooSmallError();
	}
};

// Renders the banner preset to catch images that can't be decoded. Directus caches the result for public requests.
const renderPreset = async (bannerId: string, { services, getSchema, logger }: EndpointExtensionContext) => {
	const schema = await getSchema();
	const { storage_asset_presets: presets } = await new services.SettingsService({ schema }).readSingleton({ fields: [ 'storage_asset_presets' ] });
	const preset = (presets as TransformationParams[]).find(({ key }) => key === 'banner')!;

	await new services.AssetsService({ schema }).getAsset(bannerId, { transformationParams: preset }, undefined, true).catch((error: Error & { status?: number }) => {
		if (error.status === 503) {
			throw error;
		}

		logger.warn(error, `Banner ${bannerId} failed to render.`);
		throw new InvalidFormatError();
	});
};

export const uploadBanner = async (orgId: string, image: Buffer, context: EndpointExtensionContext): Promise<string> => {
	const format = FORMATS.find(({ matches }) => matches(image))?.format;

	if (!format) {
		throw new InvalidFormatError();
	}

	const bannerId = await (await getFilesService(context)).uploadOne(Readable.from(image), {
		folder: BANNERS_FOLDER_ID,
		filename_download: `banner.${format}`,
		type: `image/${format}`,
	}) as string;

	const previous = await checkSize(bannerId, context)
		.then(() => renderPreset(bannerId, context))
		.then(() => setBanner(orgId, bannerId, context)).catch(async (error: unknown) => {
			await deleteFile(bannerId, context);
			throw error;
		});

	previous && await deleteFile(previous, context);
	return bannerId;
};

export const removeBanner = async (orgId: string, context: EndpointExtensionContext) => {
	const previous = await setBanner(orgId, null, context);
	previous && await deleteFile(previous, context);
};
