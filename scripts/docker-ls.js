import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const findDirectoriesWithPackageJson = (dir) => {
	const result = [];

	const searchDirectory = (currentDir) => {
		const files = readdirSync(currentDir);

		for (const file of files) {
			const fullPath = join(currentDir, file);
			const stat = statSync(fullPath);

			if (stat.isDirectory() && file !== 'node_modules') {
				searchDirectory(fullPath);
			} else if (file === 'package.json') {
				result.push(currentDir);
			}
		}
	};

	searchDirectory(dir);
	return result.sort();
};

const directories = findDirectoriesWithPackageJson('src');
const buildBlock = directories.map(dir => `COPY ${dir}/package.json ${dir}/`).join('\n');
const runBlock = directories.map((dir) => {
	const extensionName = dir.split('/').at(-1);

	if (extensionName === 'lib') {
		return '';
	}

	const distStr = `COPY --from=builder /builder/${dir}/dist/* /directus/extensions/${extensionName}/dist/`;
	const packageStr = `COPY --from=builder /builder/${dir}/package.json /directus/extensions/${extensionName}/`;
	return distStr + '\n' + packageStr;
}).filter(str => str !== '').join('\n');

let dockerfile = readFileSync('Dockerfile', 'utf-8');
dockerfile = dockerfile.replace(/# START: EXTENSIONS-BUILD-BLOCK[\s\S]*?# END: EXTENSIONS-BUILD-BLOCK/, '# START: EXTENSIONS-BUILD-BLOCK\n' + buildBlock + '\n# END: EXTENSIONS-BUILD-BLOCK');
dockerfile = dockerfile.replace(/# START: EXTENSIONS-RUN-BLOCK[\s\S]*?# END: EXTENSIONS-RUN-BLOCK/, '# START: EXTENSIONS-RUN-BLOCK\n' + runBlock + '\n# END: EXTENSIONS-RUN-BLOCK');

writeFileSync('Dockerfile', dockerfile);
