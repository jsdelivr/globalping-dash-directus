import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path/posix';

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

let dockerfile = readFileSync('Dockerfile', 'utf-8');
dockerfile = dockerfile.replace(/# START: EXTENSIONS-BUILD-BLOCK[\s\S]*?# END: EXTENSIONS-BUILD-BLOCK/, '# START: EXTENSIONS-BUILD-BLOCK\n' + buildBlock + '\n# END: EXTENSIONS-BUILD-BLOCK');

writeFileSync('Dockerfile', dockerfile);
