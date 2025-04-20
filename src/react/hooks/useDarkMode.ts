import { useEffect, useState } from 'react';

export const useDarkMode = () => {
    const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

    useEffect(() => {
        const checkDarkMode = () => {
            const isDark = document.documentElement.classList.contains('dark');
            setIsDarkMode(isDark);
        };

        checkDarkMode();

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.attributeName === 'class') {
                    checkDarkMode();
                }
            });
        });

        observer.observe(document.documentElement, { attributes: true });

        return () => { observer.disconnect() };
    }, []);

    return isDarkMode;
};
